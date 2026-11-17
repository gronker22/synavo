# -*- coding: utf-8 -*-
"""
Checks for the Synavo API.  Run with:  python3 tests/test_app.py
To test the deployed site instead, pass its URL:
    python3 tests/test_app.py https://yourusername.pythonanywhere.com
"""

import copy
import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

ACCOUNTS = [
    {'id': 'santander', 'name': 'Santander', 'balance': 1240, 'status': 'up', 'allow_reroute': True, 'priority': 1},
    {'id': 'revolut', 'name': 'Revolut', 'balance': 1380, 'status': 'up', 'allow_reroute': True, 'priority': 2},
    {'id': 'n26', 'name': 'N26', 'balance': 210, 'status': 'up', 'allow_reroute': True, 'priority': 3},
]
RULES = {'auto_reroute': True, 'confirm_above': 200, 'keep_buffer': 50}


def scenario(payee, amount, primary, statuses=None, pay_type='card', confirmed=False, rules=None):
    accounts = copy.deepcopy(ACCOUNTS)
    for account in accounts:
        account['status'] = (statuses or {}).get(account['id'], 'up')
    return {
        'payment': {'payee': payee, 'amount': amount, 'type': pay_type},
        'primary_account_id': primary,
        'accounts': accounts,
        'rules': rules or RULES,
        'confirmed': confirmed,
    }


def check(name, condition):
    print('{} {}'.format('PASS' if condition else 'FAIL', name))
    if not condition:
        sys.exit(1)


def test_local():
    from flask_app import app
    client = app.test_client()

    def reroute(payload):
        r = client.post('/api/reroute', json=payload)
        return r.status_code, r.get_json()

    code, body = reroute(scenario('Spotify', 10.99, 'santander'))
    check('Account up: paid from the original account',
          code == 200 and body['status'] == 'paid' and body['paid_from_account_id'] == 'santander')

    code, body = reroute(scenario('Ticketmaster', 65, 'revolut', {'revolut': 'blocked'}))
    check('Concert ticket blocked on Revolut: rerouted to Santander automatically',
          body['status'] == 'rerouted' and body['paid_from_account_id'] == 'santander'
          and body['attempts'][0]['result'] == 'failed')

    code, body = reroute(scenario('IE University tuition', 950, 'santander', {'santander': 'down'}))
    check('Tuition during Santander outage: asks before paying a large amount',
          body['status'] == 'needs_confirmation' and body['proposed_account_id'] == 'revolut')

    code, body = reroute(scenario('IE University tuition', 950, 'santander', {'santander': 'down'}, confirmed=True))
    check('Tuition approved: paid from Revolut',
          body['status'] == 'rerouted' and body['paid_from_account_id'] == 'revolut' and body['fee'] == 0)

    code, body = reroute(scenario('Rent', 650, 'santander', {'santander': 'down'}, 'direct_debit', confirmed=True))
    check('Rent direct debit with Santander down: rerouted, explained as a direct debit',
          body['status'] == 'rerouted' and 'direct debit' in body['message'])

    code, body = reroute(scenario('Laptop', 1350, 'santander', {'santander': 'down'}, confirmed=True))
    check('Too expensive for every backup: fails safely with tips',
          body['status'] == 'failed' and body['paid_from_account_id'] is None and body['tips'])

    code, body = reroute(scenario('Concert', 65, 'revolut', {'revolut': 'down', 'santander': 'slow'}))
    check('Skips a slow backup and uses the next one (N26)',
          body['status'] == 'rerouted' and body['paid_from_account_id'] == 'n26'
          and body['attempts'][1]['result'] == 'skipped')

    code, body = reroute(scenario('Concert', 65, 'revolut', {'revolut': 'down'},
                                  rules={'auto_reroute': False, 'confirm_above': 200, 'keep_buffer': 50}))
    check('Auto-reroute off: always asks first', body['status'] == 'needs_confirmation')

    code, body = reroute({'payment': {'payee': '', 'amount': -5}, 'accounts': [], 'primary_account_id': 'x'})
    check('Invalid input returns 400 with details', code == 400 and 'payment.amount' in body['details'])

    r = client.get('/api/health')
    check('GET /api/health is ok', r.status_code == 200 and r.get_json()['status'] == 'ok')

    r = client.get('/api/predict', query_string={'months_as_user': 2, 'avg_monthly_balance': 150,
                                                 'active_subscriptions': 13})
    check('Risk model API still works', r.status_code == 200 and r.get_json()['prediction'] == 1)

    r = client.get('/model', query_string={'months_as_user': 55, 'avg_monthly_balance': 4500,
                                           'active_subscriptions': 1})
    check('Risk model page still works', r.status_code == 200 and b'LOW' in r.data)

    r = client.get('/')
    check('GET / serves the app', r.status_code == 200 and b'<html' in r.data.lower())


def test_remote(base):
    base = base.rstrip('/')
    with urllib.request.urlopen(base + '/') as r:
        check('Live site: app loads', r.status == 200)

    payload = scenario('IE University tuition', 950, 'santander', {'santander': 'down'}, confirmed=True)
    req = urllib.request.Request(base + '/api/reroute', data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        body = json.load(r)
    print(json.dumps(body, indent=2))
    check('Live site: reroute API reroutes the tuition payment', body['status'] == 'rerouted')

    with urllib.request.urlopen(base + '/probmissedpaymentfixed') as r:
        check('Live site: risk model API works', 'probability_missed_payment' in json.load(r))


if __name__ == '__main__':
    if len(sys.argv) > 1:
        test_remote(sys.argv[1])
    else:
        test_local()
    print('All checks passed.')
