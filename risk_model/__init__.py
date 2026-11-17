# -*- coding: utf-8 -*-
"""
Missed-payment risk model (logistic regression, see fintech.py).

Predicts whether a Synavo user will miss a bill or subscription payment
next month from three inputs.
"""

import os

import joblib
import pandas as pd

MODEL_DIR = os.path.dirname(os.path.abspath(__file__))
model = joblib.load(os.path.join(MODEL_DIR, 'fintech.joblib'))

FEATURES = ['months_as_user', 'avg_monthly_balance', 'active_subscriptions']

# Accepted ranges, matching the data the model was trained on.
LIMITS = {
    'months_as_user':       {'type': int,   'min': 1, 'max': 60,   'label': 'Months as user'},
    'avg_monthly_balance':  {'type': float, 'min': 0, 'max': 5000, 'label': 'Average monthly balance (EUR)'},
    'active_subscriptions': {'type': int,   'min': 0, 'max': 15,   'label': 'Active subscriptions'},
}


def parse_inputs(source):
    """Validate the three model inputs. Returns (values, errors)."""
    values, errors = {}, {}
    for name, rule in LIMITS.items():
        raw = source.get(name)
        if raw is None or str(raw).strip() == '':
            errors[name] = 'is required'
            continue
        try:
            number = float(raw)
        except (TypeError, ValueError):
            errors[name] = 'must be a number'
            continue
        if rule['type'] is int and not number.is_integer():
            errors[name] = 'must be a whole number'
            continue
        if not rule['min'] <= number <= rule['max']:
            errors[name] = 'must be between {} and {}'.format(rule['min'], rule['max'])
            continue
        values[name] = rule['type'](number)
    return values, errors


def predict(values):
    """Apply the trained model and turn the output into a Synavo decision."""
    X = pd.DataFrame([values])[FEATURES]
    prob_missed = float(model.predict_proba(X)[0, 1])
    prediction = int(model.predict(X)[0])

    if prob_missed >= 0.6:
        risk_level = 'high'
        action = 'Reroute upcoming bills through the user\'s healthiest account and send an urgent alert.'
    elif prob_missed >= 0.35:
        risk_level = 'medium'
        action = 'Send a reminder 3 days before each bill and suggest pausing unused subscriptions.'
    else:
        risk_level = 'low'
        action = 'No action needed. Keep monitoring bills and subscriptions as usual.'

    return {
        'prediction': prediction,
        'prediction_label': 'missed_payment' if prediction == 1 else 'paid_on_time',
        'probability_missed_payment': round(prob_missed, 4),
        'probability_paid_on_time': round(1 - prob_missed, 4),
        'risk_level': risk_level,
        'recommended_action': action,
    }
