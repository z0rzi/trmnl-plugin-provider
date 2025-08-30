import { google, calendar_v3 } from 'googleapis';
import fs from 'fs';
import path from 'path';

export interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  calendarId?: string; // Track which calendar this event comes from
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  allDay?: boolean;
}

export interface GoogleCalendarConfig {
  serviceAccountKeyPath: string;
  calendarId?: string;
  calendarIds?: string[]; // Support for multiple calendars
}

/**
 * Service for interacting with Google Calendar API using Service Account
 */
export class GoogleCalendarService {
  private auth: any;
  private calendar: calendar_v3.Calendar | null = null;
  public readonly calendarIds: string[];
  private config: GoogleCalendarConfig;

  constructor(config: GoogleCalendarConfig) {
    if (!GoogleCalendarService.isValidConfig(config)) {
      throw new Error('Invalid Google Calendar configuration');
    }

    this.config = config;
    // Support both single calendar and multiple calendars
    this.calendarIds = config.calendarIds || [config.calendarId || 'primary'];
  }

  /**
   * Initialize the service account authentication
   */
  async initialize(): Promise<void> {
    try {
      let serviceAccountKeyPath = this.config.serviceAccountKeyPath;
      if (serviceAccountKeyPath.startsWith('./')) {
        // It's a relative path, we resolve it
        serviceAccountKeyPath = path.resolve(__dirname, serviceAccountKeyPath);
      }
      const serviceAccountConfig = await this.loadServiceAccountConfig(serviceAccountKeyPath);
      
      // Initialize service account authentication
      this.auth = new google.auth.GoogleAuth({
        credentials: serviceAccountConfig,
        scopes: [
          'https://www.googleapis.com/auth/calendar.readonly',
          'https://www.googleapis.com/auth/calendar.events.readonly'
        ]
      });

      // Initialize Calendar API client
      this.calendar = google.calendar({ version: 'v3', auth: this.auth });
    } catch (error) {
      throw new Error(`Failed to initialize service account: ${error}`);
    }
  }

  /**
   * Load service account configuration from file
   */
  private async loadServiceAccountConfig(configKeyPath?: string): Promise<any> {
    const keyPath = configKeyPath || 
                   process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || 
                   '/path/to/service-account-key.json';
    try {
      const keyFile = fs.readFileSync(keyPath, 'utf8');
      return JSON.parse(keyFile);
    } catch (error) {
      throw new Error(`Failed to load service account key from ${keyPath}: ${error}`);
    }
  }

  /**
   * Validate Google Calendar configuration
   * @param config - Configuration to validate
   * @returns True if configuration is valid
   */
  static isValidConfig(config: Partial<GoogleCalendarConfig>): config is GoogleCalendarConfig {
    return !!(
      config &&
      typeof config.serviceAccountKeyPath === 'string' &&
      config.serviceAccountKeyPath.length > 0
    );
  }

  /**
   * Get events for a specific week from all configured calendars
   * @param startDate - Start date of the week
   * @param endDate - End date of the week
   * @param maxResults - Maximum number of events to retrieve per calendar
   * @returns Promise resolving to array of calendar events
   */
  async getWeekEvents(
    startDate: Date,
    endDate: Date,
    maxResults: number = 50
  ): Promise<CalendarEvent[]> {
    if (!this.calendar) {
      throw new Error('Google Calendar API client not initialized');
    }

    try {
      const allEvents: CalendarEvent[] = [];
      
      // Fetch events from all configured calendars
      for (const calendarId of this.calendarIds) {
        try {
          const response = await this.calendar.events.list({
            calendarId: calendarId,
            timeMin: startDate.toISOString(),
            timeMax: endDate.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
            maxResults
          });

          const items = response.data.items || [];
          const events = items.map(event => this.transformEvent(event, calendarId));
          allEvents.push(...events);
        } catch (error) {
          console.warn(`Failed to fetch events from calendar ${calendarId}:`, error);
          // Continue with other calendars even if one fails
        }
      }

      // Sort all events by start time
      const sortedEvents = allEvents.sort((a, b) => {
        const aTime = a.start.dateTime || a.start.date || '';
        const bTime = b.start.dateTime || b.start.date || '';
        return aTime.localeCompare(bTime);
      });

      return sortedEvents;
    } catch (error) {
      throw new Error(`Failed to fetch calendar events: ${error}`);
    }
  }

  /**
   * Transform Google Calendar API event to our CalendarEvent format
   * @param event - Event from Google Calendar API
   * @param calendarId - ID of the calendar this event belongs to
   * @returns Transformed CalendarEvent
   */
  private transformEvent(event: calendar_v3.Schema$Event, calendarId?: string): CalendarEvent {
    const calendarEvent: CalendarEvent = {
      id: event.id || '',
      summary: event.summary || 'Untitled Event',
      description: event.description || undefined,
      location: event.location || undefined,
      calendarId: calendarId,
      start: {
        dateTime: event.start?.dateTime || undefined,
        date: event.start?.date || undefined,
        timeZone: event.start?.timeZone || undefined
      },
      end: {
        dateTime: event.end?.dateTime || undefined,
        date: event.end?.date || undefined,
        timeZone: event.end?.timeZone || undefined
      }
    };

    // Determine if it's an all-day event
    calendarEvent.allDay = !!(event.start?.date && !event.start?.dateTime);

    return calendarEvent;
  }

  /**
   * Test the connection to Google Calendar API
   * @returns Promise resolving to true if connection is successful
   */
  async testConnection(): Promise<boolean> {
    if (!this.calendar) {
      throw new Error('Google Calendar API client not initialized');
    }

    try {
      // Test connection by trying to access the first configured calendar
      const testCalendarId = this.calendarIds[0];
      await this.calendar.calendars.get({
        calendarId: testCalendarId
      });
      return true;
    } catch (error) {
      console.error('Google Calendar connection test failed:', error);
      return false;
    }
  }

  /**
   * Get information for all configured calendars
   * @returns Promise resolving to array of calendar metadata
   */
  async getCalendarsInfo(): Promise<Array<{
    id: string;
    summary: string;
    timeZone?: string;
  }>> {
    if (!this.calendar) {
      throw new Error('Google Calendar API client not initialized');
    }

    try {
      const calendarsInfo = [];
      
      for (const calendarId of this.calendarIds) {
        try {
          const response = await this.calendar.calendars.get({
            calendarId: calendarId
          });

          calendarsInfo.push({
            id: response.data.id || '',
            summary: response.data.summary || '',
            timeZone: response.data.timeZone || undefined
          });
        } catch (error) {
          console.warn(`Failed to get info for calendar ${calendarId}:`, error);
        }
      }
      
      return calendarsInfo;
    } catch (error) {
      throw new Error(`Failed to get calendars info: ${error}`);
    }
  }
}
