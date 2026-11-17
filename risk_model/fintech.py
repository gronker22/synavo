# -*- coding: utf-8 -*-
"""
Synavo - Missed Payment Risk Model

Synavo overlays a user's existing bank accounts, reroutes blocked payments
through a working account and watches subscriptions and bills.

This script predicts whether a Synavo user will MISS a bill or subscription
payment next month, so the app can warn the user or reroute the payment first.

Outputs:
    fintech.xlsx    synthetic dataset (no index)
    fintech.joblib  trained logistic regression model
"""

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report
import joblib

# Set the seed so that all variables always get the same value
np.random.seed(42)

# Generate random data
n_samples = 5000
months_as_user = np.random.randint(1, 61, n_samples)              # discrete, 1-60 months
avg_monthly_balance = np.random.uniform(0, 5000, n_samples)        # continuous, EUR
active_subscriptions = np.random.randint(0, 16, n_samples)         # discrete, 0-15

# Underlying probability of missing a payment.
# Lower balance, more subscriptions and shorter tenure all raise the risk.
prob_missed = 1 / (1 + np.exp(-(
    -0.02 * months_as_user
    - 0.0007 * avg_monthly_balance
    + 0.22 * active_subscriptions
    + 0.4
)))

# Binary target variable: 1 = missed payment, 0 = paid on time
missed_payment = np.random.binomial(1, prob_missed)

# Create DataFrame
df = pd.DataFrame({
    'months_as_user': months_as_user,
    'avg_monthly_balance': avg_monthly_balance.round(2),
    'active_subscriptions': active_subscriptions,
    'missed_payment': missed_payment
})

# Save to Excel without index
df.to_excel('fintech.xlsx', index=False)

# Split into features and target
FEATURES = ['months_as_user', 'avg_monthly_balance', 'active_subscriptions']
X = df[FEATURES]
y = df['missed_payment']

# Train-test split (70/30, stratified so both sets keep the same missed-payment rate)
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.3, random_state=42, stratify=y
)

# Create and train logistic regression model
model = LogisticRegression(max_iter=1000)
model.fit(X_train, y_train)

# Predictions
y_train_pred = model.predict(X_train)
y_test_pred = model.predict(X_test)

# Validation - classification reports
print("Missed payment rate in data: {:.1%}".format(y.mean()))

print("\nClassification Report - Train Data:")
print(classification_report(y_train, y_train_pred, target_names=['paid_on_time', 'missed_payment']))

print("\nClassification Report - Test Data:")
print(classification_report(y_test, y_test_pred, target_names=['paid_on_time', 'missed_payment']))

print("\nModel coefficients:")
for name, coef in zip(FEATURES, model.coef_[0]):
    print("  {:<22} {:+.5f}".format(name, coef))
print("  {:<22} {:+.5f}".format('intercept', model.intercept_[0]))

# Save model to joblib file
joblib.dump(model, 'fintech.joblib')

print("\nModel and dataset saved successfully.")
