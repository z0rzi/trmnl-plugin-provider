# Calendar Plugin

A Google Calendar integration plugin that displays a weekly view of your calendar events on your TRMNL device using Google Service Account authentication.

## Features

- **Week View Display**: Shows 7 days in a grid layout
- **Google Calendar Integration**: Fetches events from multiple Google Calendars using Service Account
- **Multiple Calendar Support**: Access events from multiple shared calendars simultaneously
- **No Refresh Token Required**: Uses Service Account authentication for seamless access
- **Configurable Start Day**: Choose between Monday or Sunday as the first day of the week
- **Event Colors**: Different colors for meetings, deadlines, and all-day events
- **Time Display**: Shows event times for non-all-day events
- **Error Handling**: Graceful handling of API failures with error display
- **Automatic Refresh**: Configurable refresh interval to keep events up to date

## Setup Instructions

### 1. Google Calendar API Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Calendar API:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Calendar API" and enable it

### 2. Create Service Account

1. In Google Cloud Console, go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "Service Account"
3. Enter a name for your service account (e.g., "trmnl-calendar-service")
4. Click "Create and Continue"
5. Skip role assignment for now and click "Continue"
6. Click "Done"

### 3. Generate Service Account Key

1. Click on your newly created service account
2. Go to the "Keys" tab
3. Click "Add Key" > "Create new key"
4. Choose "JSON" format and click "Create"
5. Save the downloaded JSON file securely (this contains your credentials)
6. Note the path where you saved this file

### 4. Share Calendars with Service Account

**Important**: The service account can only access calendars that are explicitly shared with it.

1. Open Google Calendar in your browser
2. For each calendar you want to access:
   - Click the three dots next to the calendar name
   - Select "Settings and sharing"
   - In "Share with specific people or groups", click "Add people and groups"
   - Enter the service account email (found in the JSON key file as `client_email`)
   - Set permissions to "See all event details" (or "Make changes to events" if needed)
   - Click "Send"

### 5. Plugin Configuration

Update the `config.json` file in the calendar plugin directory:

```json
{
  "enabled": true,
  "config": {
    "googleCalendar": {
      "serviceAccountKeyPath": "/path/to/your/service-account-key.json",
      "calendarIds": [
        "primary",
        "shared-calendar@example.com",
        "another-calendar@group.calendar.google.com"
      ]
    },
    "timezone": "America/New_York",
    "startDay": "monday"
  }
}
```

**Alternative**: You can also set the service account key path using an environment variable:
```bash
export GOOGLE_SERVICE_ACCOUNT_KEY_PATH="/path/to/your/service-account-key.json"
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `googleCalendar.serviceAccountKeyPath` | string | **Required** | Path to your service account JSON key file |
| `googleCalendar.calendarIds` | string[] | `["primary"]` | Array of calendar IDs to fetch events from |
| `timezone` | string | `"UTC"` | Timezone for displaying events |
| `startDay` | string | `"monday"` | First day of week (`"monday"` or `"sunday"`) |

### Calendar ID Types

- `"primary"` - Your primary Google Calendar
- `"email@example.com"` - Personal calendar shared with service account  
- `"calendar-id@group.calendar.google.com"` - Shared/group calendar ID
- Custom calendar IDs can be found in Google Calendar settings

## Usage

1. Complete the setup instructions above
2. Ensure your service account key file is accessible at the specified path
3. Make sure all desired calendars are shared with your service account
4. Run the application: `bun run src/index.ts`

The plugin will:
- Fetch events from all configured calendars for the current week
- Merge events from multiple calendars and sort by time
- Display them in a grid layout with 7 columns (one per day)
- Refresh automatically synchronized with your device's refresh schedule
- Show error messages if any calendar API calls fail (other calendars will continue to work)

## Troubleshooting

### "Authentication failed" Error
- Verify the service account key file path is correct and accessible
- Ensure the service account key file is valid JSON
- Check that the Google Calendar API is enabled in your project
- Verify the service account has the correct permissions

### "No events displayed" Issue
- Verify the calendar IDs are correct
- **Most Common Issue**: Ensure calendars are shared with the service account email
- Check that you have events in the specified date range
- Ensure the timezone setting matches your calendar's timezone
- Check the console/logs for per-calendar error messages

### "Failed to fetch events from calendar X" Warnings
- The specific calendar may not be shared with the service account
- The calendar ID might be incorrect
- The calendar might be deleted or inaccessible
- Other calendars will continue to work normally

### "API quota exceeded" Error
- Google Calendar API has usage limits
- Plugin refreshes are now synchronized with device refresh - consider adjusting your device's refresh rate to reduce API calls
- Check your Google Cloud Console for quota usage
- Reduce the number of calendars if hitting limits

### Permission Issues
- Ensure the service account email appears in each calendar's sharing settings
- Grant at least "See all event details" permission
- Wait a few minutes after sharing for permissions to propagate

## Security Considerations

- **Service Account Key**: Store your service account key file securely
- **File Permissions**: Ensure the key file is readable only by your application
- **Environment Variables**: Consider using environment variables for sensitive paths
- **Key Rotation**: Regularly rotate service account keys according to your security policy
- **Minimal Permissions**: Only share calendars that are necessary for the plugin

## Development

To run the tests:

```bash
yarn test src/plugins/calendar
```

The plugin includes comprehensive tests for:
- Google Calendar API integration with service accounts
- Multiple calendar event fetching and merging
- Event parsing and transformation
- Week view rendering
- Error handling for individual calendar failures
- Date calculations

## Migration from OAuth2

If you're upgrading from the previous OAuth2 implementation:

1. Create a service account following the setup instructions
2. Share your calendars with the service account
3. Update your `config.json` to use the new format
4. Remove the old `clientId`, `clientSecret`, and `refreshToken` fields
5. The plugin will now work without manual token refresh

## License

MIT
