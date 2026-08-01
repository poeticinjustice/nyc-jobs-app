/**
 * Standalone saved-search alert run.
 *
 * The refresh pipeline already calls runSavedSearchAlerts() after each cycle,
 * so this is for manual runs and for hosts that schedule alerts separately
 * from scraping (e.g. a Render cron job):
 *
 *   npm run send-alerts
 */

const { runSavedSearchAlerts } = require('../helpers/savedSearchAlerts');
const { isEmailConfigured } = require('../helpers/mailer');

if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  const mongoose = require('mongoose');

  (async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('Connected to MongoDB');
      if (!isEmailConfigured()) {
        console.warn('SMTP is not configured — in-app counts will update, no email will be sent.');
      }
      const stats = await runSavedSearchAlerts();
      console.log('Alert run complete:', stats);
    } catch (err) {
      console.error('Alert run failed:', err);
      process.exitCode = 1;
    } finally {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB');
    }
  })();
}
