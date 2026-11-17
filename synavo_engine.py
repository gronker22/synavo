# -*- coding: utf-8 -*-
"""
Synavo Smart Reroute engine.

Operational risk: a bank or payment app fails internally (outage, timeout,
false security block) and the user is the one left unable to pay.

Given a payment, the account the user wanted to pay from, and the other
accounts the user has linked, the engine decides:

    paid               the original account worked
    rerouted           the original account failed, a backup account paid
    needs_confirmation a backup account can pay, but the user's rules say
                       to ask first (large amount, or auto-reroute is off)
    failed             no linked account can pay right now

Synavo never holds money: every payment goes directly from one of the user's
own accounts. The engine only decides which one.
"""

STATUSES = ('up', 'slow', 'blocked', 'down')
PAYMENT_TYPES = ('card', 'direct_debit', 'transfer')
MAX_AMOUNT = 100000

FAILURE_REASONS = {
    'down': '{name} is down (bank outage)',
    'slow': '{name} timed out (service degraded)',
    'blocked': '{name} blocked the payment (security check)',
}


class RerouteError(ValueError):
    """Raised when the request is missing data or has invalid values."""

    def __init__(self, details):
        super().__init__('Invalid input')
        self.details = details


def _number(value, field, errors, minimum=0.0, maximum=None, default=None):
    if value is None or value == '':
        if default is not None:
            return default
        errors[field] = 'is required'
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        errors[field] = 'must be a number'
        return None
    if number < minimum or (maximum is not None and number > maximum):
        errors[field] = 'must be between {} and {}'.format(minimum, maximum if maximum is not None else 'any')
        return None
    return number


def _parse(payload):
    """Validate the request and return clean payment, accounts and rules."""
    if not isinstance(payload, dict):
        raise RerouteError({'body': 'must be a JSON object'})

    errors = {}

    raw_payment = payload.get('payment') or {}
    if not isinstance(raw_payment, dict):
        raw_payment = {}
    payment = {
        'payee': str(raw_payment.get('payee') or '').strip()[:60],
        'amount': _number(raw_payment.get('amount'), 'payment.amount', errors, 0.01, MAX_AMOUNT),
        'type': raw_payment.get('type') or 'card',
    }
    if not payment['payee']:
        errors['payment.payee'] = 'is required'
    if payment['type'] not in PAYMENT_TYPES:
        errors['payment.type'] = 'must be one of {}'.format(', '.join(PAYMENT_TYPES))

    raw_accounts = payload.get('accounts')
    accounts = []
    if not isinstance(raw_accounts, list) or not raw_accounts:
        errors['accounts'] = 'must be a non-empty list'
        raw_accounts = []
    for i, raw in enumerate(raw_accounts):
        if not isinstance(raw, dict):
            errors['accounts[{}]'.format(i)] = 'must be an object'
            continue
        prefix = 'accounts[{}].'.format(i)
        account = {
            'id': str(raw.get('id') or '').strip(),
            'name': str(raw.get('name') or raw.get('id') or '').strip()[:40],
            'balance': _number(raw.get('balance'), prefix + 'balance', errors, -MAX_AMOUNT, 10 * MAX_AMOUNT),
            'status': raw.get('status') or 'up',
            'allow_reroute': raw.get('allow_reroute', True) is not False,
            'priority': _number(raw.get('priority'), prefix + 'priority', errors, 0, 100, default=50),
            'daily_limit': _number(raw.get('daily_limit'), prefix + 'daily_limit', errors, 0, 10 * MAX_AMOUNT, default=0),
            'spent_today': _number(raw.get('spent_today'), prefix + 'spent_today', errors, 0, 10 * MAX_AMOUNT, default=0),
        }
        if not account['id']:
            errors[prefix + 'id'] = 'is required'
        if account['status'] not in STATUSES:
            errors[prefix + 'status'] = 'must be one of {}'.format(', '.join(STATUSES))
        accounts.append(account)

    ids = [a['id'] for a in accounts]
    if len(set(ids)) != len(ids):
        errors['accounts'] = 'account ids must be unique'

    primary_id = str(payload.get('primary_account_id') or '').strip()
    if accounts and primary_id not in ids:
        errors['primary_account_id'] = 'must match one of the account ids'

    raw_rules = payload.get('rules') or {}
    if not isinstance(raw_rules, dict):
        raw_rules = {}
    rules = {
        'auto_reroute': raw_rules.get('auto_reroute', True) is not False,
        'confirm_above': _number(raw_rules.get('confirm_above'), 'rules.confirm_above', errors, 0, 10 * MAX_AMOUNT, default=200),
        'keep_buffer': _number(raw_rules.get('keep_buffer'), 'rules.keep_buffer', errors, 0, MAX_AMOUNT, default=0),
    }

    if errors:
        raise RerouteError(errors)

    return payment, accounts, primary_id, rules, payload.get('confirmed') is True


def _can_pay(account, amount, buffer):
    """Return (ok, reason) for one account."""
    name = account['name'] or account['id']
    if account['status'] != 'up':
        return False, FAILURE_REASONS[account['status']].format(name=name)
    if account['balance'] - amount < buffer:
        if buffer:
            return False, '{} has €{:,.2f}, not enough to pay and keep your €{:,.0f} safety buffer'.format(
                name, account['balance'], buffer)
        return False, '{} has €{:,.2f}, not enough to pay'.format(name, account['balance'])
    if account['daily_limit'] and account['spent_today'] + amount > account['daily_limit']:
        return False, '{} would go over its €{:,.0f} daily limit'.format(name, account['daily_limit'])
    return True, '{} is up and has enough money'.format(name)


def decide_route(payload):
    """Decide which of the user's accounts should make the payment."""
    payment, accounts, primary_id, rules, confirmed = _parse(payload)
    amount = payment['amount']
    by_id = {a['id']: a for a in accounts}
    primary = by_id[primary_id]
    attempts = []

    ok, reason = _can_pay(primary, amount, buffer=0)
    attempts.append({'account_id': primary['id'], 'account': primary['name'],
                     'role': 'original', 'result': 'success' if ok else 'failed', 'reason': reason})
    if ok:
        return _result('paid', payment, primary, attempts,
                       'Paid €{:,.2f} to {} from {}.'.format(amount, payment['payee'], primary['name']))

    backups = sorted((a for a in accounts if a['id'] != primary['id'] and a['allow_reroute']),
                     key=lambda a: a['priority'])
    chosen = None
    for account in backups:
        ok, reason = _can_pay(account, amount, rules['keep_buffer'])
        attempts.append({'account_id': account['id'], 'account': account['name'],
                         'role': 'backup', 'result': 'available' if ok else 'skipped', 'reason': reason})
        if ok:
            chosen = account
            break

    if chosen is None:
        result = _result('failed', payment, None, attempts,
                         'No linked account can pay €{:,.2f} right now. Nothing was charged.'.format(amount))
        result['tips'] = [
            'Top up one of your backup accounts, or lower your safety buffer in Rules.',
            'Link another account so Synavo has more rails to choose from.',
        ]
        return result

    ask_reason = None
    if not rules['auto_reroute']:
        ask_reason = 'Auto-reroute is off, so Synavo asks before switching accounts.'
    elif amount > rules['confirm_above']:
        ask_reason = 'This is above your €{:,.0f} approval limit.'.format(rules['confirm_above'])

    if ask_reason and not confirmed:
        result = _result('needs_confirmation', payment, None, attempts,
                         '{} failed. Pay €{:,.2f} from {} instead? {}'.format(
                             primary['name'], amount, chosen['name'], ask_reason))
        result['proposed_account_id'] = chosen['id']
        return result

    attempts[-1]['result'] = 'success'
    if payment['type'] == 'direct_debit':
        message = ('Your {} direct debit was due from {}, which failed. Synavo paid €{:,.2f} from {} '
                   'so it is not returned unpaid.').format(payment['payee'], primary['name'], amount, chosen['name'])
    else:
        message = '{} failed, so Synavo paid €{:,.2f} to {} from {} instead.'.format(
            primary['name'], amount, payment['payee'], chosen['name'])
    result = _result('rerouted', payment, chosen, attempts, message)
    result['rebalance'] = {
        'from_account_id': primary['id'],
        'to_account_id': chosen['id'],
        'amount': round(amount, 2),
        'message': 'When {} is back, move €{:,.2f} to {} to even things out.'.format(
            primary['name'], amount, chosen['name']),
    }
    return result


def _result(status, payment, paid_from, attempts, message):
    return {
        'status': status,
        'payment': {'payee': payment['payee'], 'amount': round(payment['amount'], 2), 'type': payment['type']},
        'paid_from_account_id': paid_from['id'] if paid_from else None,
        'paid_from': paid_from['name'] if paid_from else None,
        'fee': 0,
        'attempts': attempts,
        'message': message,
    }
