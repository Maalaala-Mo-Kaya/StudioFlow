function notify(app) {
  for (const client of Object.values(app.subscriptionsBroker().clients())) {
    // This invalidation carries no student or staff data. Every fetch is independently authorized.
    if (client.hasSubscription("studioflow-workflow")) {
      client.send(new SubscriptionMessage({ name: "studioflow-workflow", data: "{}" }));
    }
  }
}

module.exports = { notify };
