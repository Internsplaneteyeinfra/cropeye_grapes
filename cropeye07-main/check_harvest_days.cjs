const axios = require('axios');

async function checkHarvestDays() {
  try {
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().slice(0, 10);
    const url = `https://events-cropeye.up.railway.app/plots/agroStats?end_date=${today}`;

    console.log(`Fetching data from: ${url}`);

    const response = await axios.get(url);
    const data = response.data;

    console.log('\n--- Days to Harvest Data ---');
    let count = 0;

    for (const plotId in data) {
      if (data.hasOwnProperty(plotId)) {
        const plotData = data[plotId];
        const daysToHarvest = plotData.days_to_harvest;

        // Only show if days_to_harvest is present (null or number)
        if (daysToHarvest !== undefined) {
          console.log(`Plot ID: ${plotId.padEnd(20)} | Days to Harvest: ${daysToHarvest}`);
          count++;
        }
      }
    }

    if (count === 0) {
      console.log('No plots found with "days_to_harvest" field.');
    } else {
      console.log(`\nTotal plots with data: ${count}`);
    }

  } catch (error) {
    console.error('Error fetching data:', error.message);
  }
}

checkHarvestDays();
