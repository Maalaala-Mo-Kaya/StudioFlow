function notify(app, topic = "studioflow-workflow") {
  for (const client of Object.values(app.subscriptionsBroker().clients())) {
    // This invalidation carries no student or staff data. Every fetch is independently authorized.
    if (client.hasSubscription(topic)) {
      client.send(new SubscriptionMessage({ name: topic, data: "{}" }));
    }
  }
}

module.exports = { notify };
