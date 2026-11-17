# -*- coding: utf-8 -*-
"""
Synavo MVP - web app and API.

Routes:
    GET  /                          Synavo app (no login, data saved in the user's browser),
                                    built from frontend/ into frontend/out
    POST /api/reroute               Smart Reroute engine: which account should pay?
    GET  /api/health                Health check
    GET  /api                       JSON description of the API

    Missed-payment risk model (from the ML assignment):
    GET  /model                     HTML form; with GET parameters it shows the prediction
    GET/POST /api/predict           JSON prediction
    GET  /probmissedpayment         same as GET /api/predict (class pattern)
    GET  /probmissedpaymentfixed    prediction for a hard-coded user (class test)
"""

import os

from flask import Flask, abort, jsonify, render_template, request, send_from_directory

import risk_model
from synavo_engine import RerouteError, decide_route

app = Flask(__name__)

# The app's front end is a static export built from frontend/ (see README).
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'frontend', 'out')


@app.route('/')
def index():
    return send_from_directory(FRONTEND_DIR, 'index.html')


@app.route('/api/reroute', methods=['POST'])
def api_reroute():
    payload = request.get_json(silent=True)
    try:
        return jsonify(decide_route(payload))
    except RerouteError as exc:
        return jsonify({'error': 'Invalid input', 'details': exc.details}), 400


@app.route('/api/health')
def api_health():
    return jsonify({'status': 'ok', 'app': 'Synavo MVP'})


@app.route('/api')
def api_docs():
    return jsonify({
        'name': 'Synavo API',
        'endpoints': {
            'POST /api/reroute': 'Decide which linked account pays when a bank or app fails. See README.',
            'GET|POST /api/predict': 'Missed-payment risk model (inputs: months_as_user, avg_monthly_balance, active_subscriptions).',
            'GET /probmissedpayment': 'Same as GET /api/predict.',
            'GET /probmissedpaymentfixed': 'Risk model prediction for a hard-coded user.',
            'GET /api/health': 'Health check.',
        },
        'docs': 'https://github.com/gronker22/synavo#api',
    })


# ---------------------------------------------------------------------------
# Missed-payment risk model (ML assignment, kept so its links keep working)
# ---------------------------------------------------------------------------

@app.route('/model', methods=['GET', 'POST'])
def model_page():
    form = request.form if request.method == 'POST' else request.args
    result = None
    errors = {}
    if any(name in form for name in risk_model.FEATURES):
        values, errors = risk_model.parse_inputs(form)
        if not errors:
            result = risk_model.predict(values)
    return render_template('model.html', form=form, result=result, errors=errors, limits=risk_model.LIMITS)


@app.route('/probmissedpaymentfixed')
def probmissedpaymentfixed():
    values = {'months_as_user': 6, 'avg_monthly_balance': 450, 'active_subscriptions': 9}
    return jsonify({'input': values, **risk_model.predict(values)})


@app.route('/probmissedpayment', methods=['GET', 'POST'])
@app.route('/api/predict', methods=['GET', 'POST'])
def api_predict():
    if request.method == 'POST':
        source = request.get_json(silent=True)
        if not isinstance(source, dict):
            return jsonify({'error': 'Send a JSON object with Content-Type: application/json'}), 400
    else:
        source = request.args

    values, errors = risk_model.parse_inputs(source)
    if errors:
        return jsonify({'error': 'Invalid input', 'details': errors}), 400

    return jsonify({'input': values, **risk_model.predict(values)})


@app.route('/<path:path>')
def frontend_files(path):
    """Serve the built front end's assets (JS, CSS, icons) and pages."""
    for candidate in (path, path + '.html', os.path.join(path, 'index.html')):
        if os.path.isfile(os.path.join(FRONTEND_DIR, candidate)):
            return send_from_directory(FRONTEND_DIR, candidate)
    abort(404)


if __name__ == '__main__':
    app.run(debug=True)
