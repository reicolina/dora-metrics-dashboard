/**
 * DORA Metrics Collection for Google Apps Script
 * 
 * This script collects DORA (DevOps Research and Assessment) metrics from various sources:
 * - Deployment Frequency (from Bitbucket)
 * - Lead Time for Changes (from Jira)
 * - Mean Time to Recovery (from Pingdom)
 * - Change Failure Rate (from Jira bug tracking)
 * - Additional KPIs from Metabase
 * 
 * @author Your Name
 * @version 1.0.0
 */

// Configuration - Replace these with your actual values
const CONFIG = {
  // Metabase Configuration
  METABASE_URL: 'https://your-instance.metabaseapp.com',
  METABASE_API_KEY: 'your_metabase_api_key_here',
  
  // Jira Configuration
  JIRA_BASE_URL: 'https://your-instance.atlassian.net',
  JIRA_PROJECT_KEY: 'ENG', // Your project key
  JIRA_EMAIL: 'your-email@company.com',
  JIRA_API_TOKEN: 'your_jira_api_token_here',
  JIRA_EPIC_KEY: 'ENG-40', // Replace with your Epic key for coverage tracking
  
  // Pingdom Configuration
  PINGDOM_API_TOKEN: 'your_pingdom_api_token_here',
  PINGDOM_CHECK_IDS: ['check_id_1', 'check_id_2'], // Your Pingdom check IDs
  
  // Bitbucket Configuration
  BITBUCKET_WORKSPACE: 'your-workspace',
  BITBUCKET_USERNAME: 'your-username',
  BITBUCKET_APP_PASSWORD: 'your_app_password_here',
  BITBUCKET_ENVIRONMENT: 'Production',
  BITBUCKET_ALLOWED_REPOS: [
    'repo-1',
    'repo-2',
    'repo-3'
    // Add your repository slugs here
  ]
};

/**
 * Fetches KPI data from Metabase
 * @param {number} questionId - The Metabase question ID
 * @param {string} referenceDate - Date in YYYY-MM-DD format
 * @returns {number} The KPI value
 */
function GETKPIFROMMETABASE(questionId, referenceDate) {
  const cacheKey = `metabase-${questionId}-${referenceDate}`;
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  
  if (cached != null) {
    console.log('Cache hit! Value is: ' + cached);
    return Math.ceil(cached * 10) / 10;
  }
  
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': CONFIG.METABASE_API_KEY
  };

  const payload = JSON.stringify({
    parameters: [
      {
        type: 'date/single',
        target: ['variable', ['template-tag', 'reference_date']],
        value: referenceDate
      }
    ]
  });

  const url = `${CONFIG.METABASE_URL}/api/card/${questionId}/query/json`;
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: headers,
    payload: payload,
    muteHttpExceptions: true
  });

  const result = JSON.parse(response.getContentText());

  if (!result || !result.length) {
    throw new Error("No results returned or query failed from Metabase.");
  }

  const value = result[0][Object.keys(result[0])[0]];
  console.log(`Metabase KPI value: ${value}`);
  
  cache.put(cacheKey, value, 1500); // Cache for 25 minutes
  return Math.ceil(value * 10) / 10;
}

/**
 * Calculates lead time from Jira (In Progress to Done)
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {number} Median lead time in business days
 */
function GETLEADTIMEFROMJIRA(dateString) {
  const cacheKey = `jira-leadtime-${dateString}`;
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  
  if (cached != null) {
    console.log('Cache hit! Value is: ' + cached);
    return Math.ceil(cached * 10) / 10;
  }

  const headers = {
    Authorization: 'Basic ' + Utilities.base64Encode(CONFIG.JIRA_EMAIL + ':' + CONFIG.JIRA_API_TOKEN),
    Accept: 'application/json'
  };

  const endDate = dateString ? new Date(dateString) : new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 29); // 30-day window

  const jql = `project = ${CONFIG.JIRA_PROJECT_KEY} AND status = Done AND statusCategoryChangedDate >= "${startDate.toISOString().split('T')[0]}" ORDER BY updated DESC`;

  const leadTimes = [];
  let startAt = 0;
  const maxResults = 100;
  let total = 1;

  while (startAt < total) {
    const searchUrl = `${CONFIG.JIRA_BASE_URL}/rest/api/3/search?jql=${encodeURIComponent(jql)}&expand=changelog&startAt=${startAt}&maxResults=${maxResults}`;

    const response = UrlFetchApp.fetch(searchUrl, {
      method: 'get',
      headers: headers,
      muteHttpExceptions: true
    });

    const data = JSON.parse(response.getContentText());
    const issues = data.issues || [];
    total = data.total || 0;

    issues.forEach(issue => {
      const changelog = issue.changelog?.histories || [];
      let inProgressDate = null;
      let doneDate = null;

      changelog.forEach(entry => {
        const items = entry.items || [];
        items.forEach(change => {
          if (change.field === 'status') {
            if (change.toString === 'In Progress' && !inProgressDate) {
              inProgressDate = new Date(entry.created);
            }
            if (change.toString === 'Done') {
              const potentialDoneDate = new Date(entry.created);
              if (potentialDoneDate >= startDate && potentialDoneDate <= endDate) {
                doneDate = potentialDoneDate;
              }
            }
          }
        });
      });

      if (inProgressDate && doneDate && doneDate > inProgressDate) {
        const businessDays = countBusinessDays(inProgressDate, doneDate);
        leadTimes.push(businessDays);
      }
    });

    startAt += maxResults;
  }

  if (leadTimes.length === 0) return 0;

  leadTimes.sort((a, b) => a - b);
  const mid = Math.floor(leadTimes.length / 2);
  const median = leadTimes.length % 2 === 0
    ? (leadTimes[mid - 1] + leadTimes[mid]) / 2
    : leadTimes[mid];

  cache.put(cacheKey, median, 1500);
  console.log(`Jira lead time median: ${median.toFixed(2)}`);
  return parseFloat(median.toFixed(2));
}

/**
 * Helper function to count business days between two dates (excludes weekends)
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {number} Number of business days
 */
function countBusinessDays(startDate, endDate) {
  let count = 0;
  const current = new Date(startDate);
  while (current <= endDate) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++; // Skip Sundays (0) and Saturdays (6)
    current.setDate(current.getDate() + 1);
  }
  return count;
}

/**
 * Calculates Epic coverage percentage from Jira
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {number} Percentage of issues linked to Epic
 */
function GETEPICCOVERAGEPERCENTAGE(dateString) {
  const cacheKey = `jira-epic-coverage-${dateString}`;
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  
  if (cached != null) {
    console.log('Cache hit! Value is: ' + cached);
    return Math.ceil(cached * 10) / 10;
  }

  const headers = {
    Authorization: 'Basic ' + Utilities.base64Encode(CONFIG.JIRA_EMAIL + ':' + CONFIG.JIRA_API_TOKEN),
    Accept: 'application/json'
  };

  const endDate = dateString ? new Date(dateString) : new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 29);

  const jql = `project = ${CONFIG.JIRA_PROJECT_KEY} AND status = Done AND statusCategoryChangedDate >= "${startDate.toISOString().split('T')[0]}" ORDER BY updated DESC`;

  let totalIssues = 0;
  let epicIssues = 0;
  let startAt = 0;
  const maxResults = 100;
  let total = 1;

  while (startAt < total) {
    const searchUrl = `${CONFIG.JIRA_BASE_URL}/rest/api/3/search?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}&fields=parent`;

    const response = UrlFetchApp.fetch(searchUrl, {
      method: 'get',
      headers: headers,
      muteHttpExceptions: true
    });

    const data = JSON.parse(response.getContentText());
    const issues = data.issues || [];
    total = data.total || 0;

    issues.forEach(issue => {
      totalIssues++;
      if (issue.fields?.parent?.key === CONFIG.JIRA_EPIC_KEY) {
        epicIssues++;
      }
    });

    startAt += maxResults;
  }

  if (totalIssues === 0) return 0;

  const percentage = (epicIssues / totalIssues) * 100;
  cache.put(cacheKey, percentage, 1500);
  console.log(`Epic coverage: ${percentage.toFixed(2)}%`);
  return parseFloat(percentage.toFixed(2));
}

/**
 * Gets uptime percentage from Pingdom
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {number} Uptime percentage
 */
function GETPINGDOMUPTIMEPERCENTAGE(dateString) {
  const cacheKey = `pingdom-uptime-${dateString}`;
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  
  if (cached != null) {
    console.log('Cache hit! Value is: ' + cached);
    return Math.floor(cached * 100) / 100;
  }

  const headers = {
    Authorization: 'Bearer ' + CONFIG.PINGDOM_API_TOKEN,
    Accept: 'application/json'
  };

  const endDate = dateString ? new Date(dateString) : new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 29);

  const fromTimestamp = Math.floor(startDate.getTime() / 1000);
  const toTimestamp = Math.floor(endDate.getTime() / 1000);
  const totalPeriod = toTimestamp - fromTimestamp;

  let totalDowntime = 0;

  CONFIG.PINGDOM_CHECK_IDS.forEach(checkId => {
    const url = `https://api.pingdom.com/api/3.1/summary.outage/${checkId}?from=${fromTimestamp}&to=${toTimestamp}`;

    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: headers,
      muteHttpExceptions: true
    });

    const data = JSON.parse(response.getContentText());
    const outages = data.summary?.states || [];

    outages.forEach(outage => {
      if (outage.status === 'down') {
        totalDowntime += outage.timeto - outage.timefrom;
      }
    });
  });

  const totalPossibleUptime = totalPeriod * CONFIG.PINGDOM_CHECK_IDS.length;
  const uptimePercentage = ((totalPossibleUptime - totalDowntime) / totalPossibleUptime) * 100;
  
  cache.put(cacheKey, uptimePercentage, 1500);
  console.log(`Pingdom uptime: ${Math.floor(uptimePercentage * 100) / 100}%`);
  return Math.floor(uptimePercentage * 100) / 100;
}

/**
 * Gets average recovery time from Pingdom
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {number} Average recovery time in minutes
 */
function GETPINGDOMAVGRECOVERYTIME(dateString) {
  const cacheKey = `pingdom-recovery-${dateString}`;
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  
  if (cached != null) {
    console.log('Cache hit! Value is: ' + cached);
    return Math.floor(cached * 100) / 100;
  }

  const headers = {
    Authorization: 'Bearer ' + CONFIG.PINGDOM_API_TOKEN,
    Accept: 'application/json'
  };

  const endDate = dateString ? new Date(dateString) : new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 29);

  const fromTimestamp = Math.floor(startDate.getTime() / 1000);
  const toTimestamp = Math.floor(endDate.getTime() / 1000);

  let totalDowntime = 0;
  let outageCount = 0;

  CONFIG.PINGDOM_CHECK_IDS.forEach(checkId => {
    const url = `https://api.pingdom.com/api/3.1/summary.outage/${checkId}?from=${fromTimestamp}&to=${toTimestamp}`;

    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: headers,
      muteHttpExceptions: true
    });

    const data = JSON.parse(response.getContentText());
    const outages = data.summary?.states || [];

    outages.forEach(outage => {
      if (outage.status === 'down') {
        const durationSeconds = outage.timeto - outage.timefrom;
        if (durationSeconds > 0) {
          totalDowntime += durationSeconds;
          outageCount++;
        }
      }
    });
  });

  if (outageCount === 0) return 0;

  const avgRecoveryMinutes = (totalDowntime / outageCount) / 60;
  cache.put(cacheKey, avgRecoveryMinutes, 1500);
  console.log(`Average recovery time: ${Math.floor(avgRecoveryMinutes * 100) / 100} minutes`);
  return Math.floor(avgRecoveryMinutes * 100) / 100;
}

/**
 * Gets deployment count for current month from Bitbucket
 * @returns {number} Number of deployments to production
 */
function GETDEPLOYMENTS() {
  const headers = {
    Authorization: 'Basic ' + Utilities.base64Encode(CONFIG.BITBUCKET_USERNAME + ':' + CONFIG.BITBUCKET_APP_PASSWORD),
    Accept: 'application/json'
  };

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0);

  let deploymentCount = 0;
  let repoUrl = `https://api.bitbucket.org/2.0/repositories/${CONFIG.BITBUCKET_WORKSPACE}?pagelen=100`;
  const uuidToEnvNameMap = {};

  while (repoUrl) {
    const repoResponse = UrlFetchApp.fetch(repoUrl, { method: 'get', headers });
    const repoData = JSON.parse(repoResponse.getContentText());
    const repositories = repoData.values || [];

    for (const repo of repositories) {
      const repoSlug = repo.slug;

      if (!CONFIG.BITBUCKET_ALLOWED_REPOS.includes(repoSlug)) {
        continue;
      }

      let page = 1;
      const pagelen = 100;
      let hasMorePages = true;

      while (hasMorePages) {
        const deploymentsUrl = `https://api.bitbucket.org/2.0/repositories/${CONFIG.BITBUCKET_WORKSPACE}/${repoSlug}/deployments/?pagelen=${pagelen}&page=${page}`;
        const deploymentsResponse = UrlFetchApp.fetch(deploymentsUrl, { method: 'get', headers });
        const deploymentsData = JSON.parse(deploymentsResponse.getContentText());
        const deployments = deploymentsData.values || [];

        for (const deployment of deployments) {
          const deploymentDate = new Date(deployment.created_on);
          const envUUID = deployment.environment?.uuid;

          if (!envUUID || deploymentDate < startDate || deploymentDate > endDate) {
            continue;
          }

          const cleanedUUID = envUUID.replace(/{|}/g, '');
          let targetEnvironmentName = uuidToEnvNameMap[cleanedUUID];

          if (!targetEnvironmentName) {
            const envUrl = `https://api.bitbucket.org/2.0/repositories/${CONFIG.BITBUCKET_WORKSPACE}/${repoSlug}/environments/%7B${cleanedUUID}%7D`;
            const envResponse = UrlFetchApp.fetch(envUrl, { method: 'get', headers });
            const envData = JSON.parse(envResponse.getContentText());

            targetEnvironmentName = envData.name || '';
            uuidToEnvNameMap[cleanedUUID] = targetEnvironmentName;
          }

          if (CONFIG.BITBUCKET_ENVIRONMENT.toLowerCase() === targetEnvironmentName.toLowerCase()) {
            deploymentCount++;
          }
        }

        hasMorePages = deployments.length >= pagelen;
        page++;
      }
    }

    repoUrl = repoData.next || null;
  }

  // Optional: Update a tracking sheet
  updateDeploymentSheet(year, month + 1, deploymentCount);

  console.log(`Deployments this month: ${deploymentCount}`);
  return deploymentCount;
}

/**
 * Updates deployment tracking sheet
 * @param {number} year - Year
 * @param {number} month - Month (1-based)
 * @param {number} deploymentCount - Number of deployments
 */
function updateDeploymentSheet(year, month, deploymentCount) {
  const sheetName = 'ENG: Deployment Stats';
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    sheet.appendRow(['Year', 'Month', 'Deployment Count']);
  }

  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  let rowFound = false;

  for (let i = 1; i < values.length; i++) {
    const rowYear = values[i][0];
    const rowMonth = values[i][1];

    if (rowYear === year && rowMonth === month) {
      sheet.getRange(i + 1, 3).setValue(deploymentCount);
      rowFound = true;
      break;
    }
  }

  if (!rowFound) {
    sheet.appendRow([year, month, deploymentCount]);
  }
}

/**
 * Counts Jira bugs created in a specific month
 * @param {string} monthAbbrev - Three-letter month abbreviation (e.g., 'APR')
 * @returns {number} Number of bugs created
 */
function COUNTJIRABUGSBYMONTH(monthAbbrev) {
  const monthMap = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };

  const now = new Date();
  const targetMonth = monthAbbrev ? monthMap[monthAbbrev.toLowerCase()] : now.getMonth();
  const targetYear = now.getFullYear();

  if (targetMonth === undefined) {
    throw new Error('Invalid month abbreviation provided.');
  }

  const startDate = new Date(targetYear, targetMonth, 1);
  const endDate = new Date(targetYear, targetMonth + 1, 0);

  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  const filter = `project = ${CONFIG.JIRA_PROJECT_KEY} AND status not in ("WON'T DO") AND type = Bug AND (labels NOT IN ("user-error", "pre-existing") OR labels IS EMPTY)`;
  const jql = `${filter} AND created >= "${startDateStr}" AND created <= "${endDateStr}"`;

  const url = `${CONFIG.JIRA_BASE_URL}/rest/api/3/search`;
  const headers = {
    'Authorization': 'Basic ' + Utilities.base64Encode(CONFIG.JIRA_EMAIL + ':' + CONFIG.JIRA_API_TOKEN),
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };

  const payload = JSON.stringify({
    jql: jql,
    maxResults: 0
  });

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: headers,
    payload: payload,
    muteHttpExceptions: true
  });

  const data = JSON.parse(response.getContentText());
  const bugCount = data.total || 0;
  
  console.log(`Bugs created in ${monthAbbrev}: ${bugCount}`);
  return bugCount;
}