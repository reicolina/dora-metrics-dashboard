# DORA Metrics Google Apps Script

A Google Apps Script solution for collecting and tracking DORA (DevOps Research and Assessment) metrics and other software engineering KPIs from multiple sources.

## 📊 Metrics Collected

This script collects the following DORA metrics and additional KPIs:

### DORA Metrics
- **Deployment Frequency** - How often deployments occur to production (from Bitbucket)
- **Lead Time for Changes** - Time from code committed to production (from Jira workflow)
- **Mean Time to Recovery** - Average time to recover from failures (from Pingdom)
- **Change Failure Rate** - Percentage of deployments causing failures (from Jira bug tracking)

### Additional KPIs
- Custom metrics from Metabase dashboards
- Epic coverage percentage from Jira
- Service uptime percentage from Pingdom
- Bug count tracking by month

## 🚀 Setup Instructions

### 1. Create a Google Apps Script Project

1. Go to [Google Apps Script](https://script.google.com/)
2. Create a new project
3. Replace the default code with the provided script
4. Save the project with a meaningful name

### 2. Configure API Access

#### Metabase Setup
1. Log into your Metabase instance
2. Go to Settings → Admin → API Keys
3. Create a new API key
4. Copy the key to the `CONFIG.METABASE_API_KEY` field

#### Jira Setup
1. Go to your Jira instance
2. Navigate to Account Settings → Security → API tokens
3. Create a new API token
4. Update the following in the CONFIG object:
   - `JIRA_BASE_URL`: Your Jira instance URL
   - `JIRA_EMAIL`: Your email address
   - `JIRA_API_TOKEN`: The generated API token
   - `JIRA_PROJECT_KEY`: Your project key (e.g., 'ENG')

#### Pingdom Setup
1. Log into Pingdom
2. Go to Account → API Tokens
3. Create a new API token
4. Find your check IDs from the Pingdom dashboard
5. Update the CONFIG object with your token and check IDs

#### Bitbucket Setup
1. Go to Bitbucket → Personal settings → App passwords
2. Create a new app password with repository read permissions
3. Update the CONFIG object with:
   - `BITBUCKET_WORKSPACE`: Your workspace name
   - `BITBUCKET_USERNAME`: Your username
   - `BITBUCKET_APP_PASSWORD`: The generated app password
   - `BITBUCKET_ALLOWED_REPOS`: Array of repository slugs to track

### 3. Configure the Script

Update the `CONFIG` object at the top of the script with your specific values:

```javascript
const CONFIG = {
  // Metabase Configuration
  METABASE_URL: 'https://your-instance.metabaseapp.com',
  METABASE_API_KEY: 'your_metabase_api_key_here',
  
  // Jira Configuration
  JIRA_BASE_URL: 'https://your-instance.atlassian.net',
  JIRA_PROJECT_KEY: 'YOUR_PROJECT_KEY',
  JIRA_EMAIL: 'your-email@company.com',
  JIRA_API_TOKEN: 'your_jira_api_token_here',
  JIRA_EPIC_KEY: 'YOUR-EPIC-KEY',
  
  // ... other configurations
};
```

## 📋 Usage

### Using Functions in Google Sheets

Once configured, you can use these functions directly in Google Sheets:

```
=GETLEADTIMEFROMJIRA("2024-12-31")
=GETDEPLOYMENTS()
=GETPINGDOMUPTIMEPERCENTAGE("2024-12-31")
=COUNTJIRABUGSBYMONTH("DEC")
```

### Available Functions

| Function | Parameters | Description |
|----------|------------|-------------|
| `GETKPIFROMMETABASE(questionId, referenceDate)` | questionId: Metabase question ID<br>referenceDate: Date in YYYY-MM-DD format | Fetches KPI from Metabase |
| `GETLEADTIMEFROMJIRA(dateString)` | dateString: Date in YYYY-MM-DD format | Calculates median lead time |
| `GETEPICCOVERAGEPERCENTAGE(dateString)` | dateString: Date in YYYY-MM-DD format | Epic coverage percentage |
| `GETPINGDOMUPTIMEPERCENTAGE(dateString)` | dateString: Date in YYYY-MM-DD format | Service uptime percentage |
| `GETPINGDOMAVGRECOVERYTIME(dateString)` | dateString: Date in YYYY-MM-DD format | Average recovery time |
| `GETDEPLOYMENTS()` | None | Current month deployment count |
| `COUNTJIRABUGSBYMONTH(monthAbbrev)` | monthAbbrev: Three-letter month (e.g., 'JAN') | Bug count for month |

### Setting Up Triggers

To automate data collection:

1. In Apps Script, go to Triggers (clock icon)
2. Add triggers for functions you want to run automatically
3. Set the frequency (daily, weekly, monthly)

Example trigger setup:
- `GETDEPLOYMENTS()` - Monthly on the 1st
- `GETLEADTIMEFROMJIRA()` - Weekly on Mondays
- `GETPINGDOMUPTIMEPERCENTAGE()` - Daily

## 📈 Creating Dashboards

### Sample Dashboard Structure

Create a Google Sheet with the following structure:

```
| Metric | Current Value | Target | Status |
|--------|---------------|--------|--------|
| Lead Time (days) | =GETLEADTIMEFROMJIRA(TODAY()) | 5 | |
| Deployments This Month | =GETDEPLOYMENTS() | 20 | |
| Uptime % | =GETPINGDOMUPTIMEPERCENTAGE(TODAY()) | 99.9 | |
| Recovery Time (min) | =GETPINGDOMAVGRECOVERYTIME(TODAY()) | 30 | |
```

### Conditional Formatting

Add conditional formatting to highlight metrics that are:
- Green: Meeting targets
- Yellow: Close to targets
- Red: Missing targets

## 🔧 Customization

### Adding New Metrics

To add a new metric source:

1. Create a new function following the existing pattern
2. Add caching using `CacheService`
3. Include proper error handling
4. Document the function parameters

### Modifying Time Windows

Most functions use a 30-day rolling window. To modify:

```javascript
// Change from 30 days to 7 days
startDate.setDate(endDate.getDate() - 6); // 7-day window
```

### Customizing Jira Queries

Modify the JQL queries to match your workflow:

```javascript
// Example: Include different statuses
const jql = `project = ${CONFIG.JIRA_PROJECT_KEY} AND status IN ("Done", "Deployed") AND...`;
```

## ⚡ Performance Optimization

### Caching
- Functions use Google Apps Script's CacheService
- Cache duration: 25 minutes (1500 seconds)
- Reduces API calls and improves performance

### Rate Limiting
- Built-in pagination for large datasets
- Respects API rate limits
- Includes error handling for failed requests

### Best Practices
- Use triggers for regular updates rather than real-time queries
- Cache results when possible
- Monitor API usage quotas

## 🔒 Security Considerations

### API Token Management
- Store sensitive tokens in Apps Script's PropertiesService for production
- Never commit tokens to version control
- Rotate tokens regularly

### Permissions
- Grant minimum required permissions for each API
- Use service accounts where possible
- Regularly audit access

## 🐛 Troubleshooting

### Common Issues

**Function returns 0 or null:**
- Check API credentials
- Verify API endpoints are accessible
- Check date formats (should be YYYY-MM-DD)

**Authorization errors:**
- Verify API tokens are correct and not expired
- Check that the user has necessary permissions
- Ensure API endpoints are correct

**Timeout errors:**
- Reduce the time window for data collection
- Add more specific filters to queries
- Consider breaking large operations into smaller chunks

**Cache issues:**
- Clear cache manually: `CacheService.getScriptCache().removeAll()`
- Check cache key uniqueness
- Verify cache expiration times

## 📚 API References

- [Jira REST API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
- [Bitbucket REST API](https://developer.atlassian.com/bitbucket/api/2/reference/)
- [Pingdom API](https://docs.pingdom.com/api/)
- [Metabase API](https://www.metabase.com/docs/latest/api-documentation)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- DORA metrics framework by Google Cloud
- Google Apps Script platform
- All the API providers for making this integration possible

## 📞 Support

If you encounter any issues or have questions:

1. Check the troubleshooting section above
2. Review the API documentation for the specific service
3. Open an issue in this repository with detailed information about your problem

---

**Note:** Remember to keep your API tokens secure and never commit them to version control. Consider using Google Apps Script's PropertiesService for storing sensitive configuration in production environments.