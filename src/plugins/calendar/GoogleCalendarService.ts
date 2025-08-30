import { google, calendar_v3 } from "googleapis";
import fs from "fs";
import path from "path";
import { DateTime } from "luxon";

export interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  calendarId?: string; // Track which calendar this event comes from
  start: DateTime;
  end: DateTime;
  allDay?: boolean;
}

export interface GoogleCalendarConfig {
  serviceAccountKeyPath: string;
  calendarIds: string[];
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
      throw new Error("Invalid Google Calendar configuration");
    }

    this.config = config;
    // Support both single calendar and multiple calendars
    this.calendarIds = config.calendarIds;
  }

  /**
   * Initialize the service account authentication
   */
  async initialize(): Promise<void> {
    try {
      let serviceAccountKeyPath = this.config.serviceAccountKeyPath;
      if (serviceAccountKeyPath.startsWith("./")) {
        // It's a relative path, we resolve it
        serviceAccountKeyPath = path.resolve(__dirname, serviceAccountKeyPath);
      }
      const serviceAccountConfig = await this.loadServiceAccountConfig(
        serviceAccountKeyPath,
      );

      // Initialize service account authentication
      this.auth = new google.auth.GoogleAuth({
        credentials: serviceAccountConfig,
        scopes: [
          "https://www.googleapis.com/auth/calendar.readonly",
          "https://www.googleapis.com/auth/calendar.events.readonly",
        ],
      });

      // Initialize Calendar API client
      this.calendar = google.calendar({ version: "v3", auth: this.auth });
    } catch (error) {
      throw new Error(`Failed to initialize service account: ${error}`);
    }
  }

  /**
   * Load service account configuration from file
   */
  private async loadServiceAccountConfig(configKeyPath?: string): Promise<any> {
    const keyPath =
      configKeyPath ||
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH ||
      "/path/to/service-account-key.json";
    try {
      const keyFile = fs.readFileSync(keyPath, "utf8");
      return JSON.parse(keyFile);
    } catch (error) {
      throw new Error(
        `Failed to load service account key from ${keyPath}: ${error}`,
      );
    }
  }

  /**
   * Validate Google Calendar configuration
   * @param config - Configuration to validate
   * @returns True if configuration is valid
   */
  static isValidConfig(
    config: Partial<GoogleCalendarConfig>,
  ): config is GoogleCalendarConfig {
    return !!(
      config &&
      typeof config.serviceAccountKeyPath === "string" &&
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
    startDate: DateTime,
    endDate: DateTime,
    maxResults: number = 50,
  ): Promise<CalendarEvent[]> {
    if (!this.calendar) {
      throw new Error("Google Calendar API client not initialized");
    }
    const startStr = startDate.toISO();
    const endStr = endDate.toISO();

    if (!startStr || !endStr) {
      throw new Error("Invalid start or end date");
    }

    try {
      const allEvents: CalendarEvent[] = [];

      // Fetch events from all configured calendars
      for (const calendarId of this.calendarIds) {
        try {
          const response = await this.calendar.events.list({
            calendarId: calendarId,
            timeMin: startStr,
            timeMax: endStr,
            singleEvents: true,
            orderBy: "startTime",
            maxResults,
          });

          const items = response.data.items || [];
          const events = items.map((event) =>
            this.transformEvent(event, calendarId),
          );
          allEvents.push(...events);
        } catch (error) {
          console.warn(
            `Failed to fetch events from calendar ${calendarId}:`,
            error,
          );
          // Continue with other calendars even if one fails
        }
      }

      // Sort all events by start time
      const sortedEvents = allEvents.sort((a, b) => {
        return +a - +b;
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
  private transformEvent(
    event: calendar_v3.Schema$Event,
    calendarId?: string,
  ): CalendarEvent {
    const startStr = event.start?.dateTime || event.start?.date;
    const startTz = event.start?.timeZone;
    const endStr = event.end?.dateTime || event.end?.date;
    const endTz = event.end?.timeZone;

    if (!startStr || !endStr) {
      throw new Error("Invalid event start or end date");
    }

    const calendarEvent: CalendarEvent = {
      id: event.id || "",
      summary: event.summary || "Untitled Event",
      description: event.description || undefined,
      location: event.location || undefined,
      calendarId: calendarId,
      start: DateTime.fromISO(startStr, { zone: startTz ?? undefined }),
      end: DateTime.fromISO(endStr, { zone: endTz ?? undefined }),
      allDay: !!(event.start?.date && !event.start?.dateTime),
    };

    return calendarEvent;
  }

  /**
   * Test the connection to Google Calendar API
   * @returns Promise resolving to true if connection is successful
   */
  async testConnection(): Promise<boolean> {
    if (!this.calendar) {
      throw new Error("Google Calendar API client not initialized");
    }

    try {
      // Test connection by trying to access the first configured calendar
      const testCalendarId = this.calendarIds[0];
      await this.calendar.calendars.get({
        calendarId: testCalendarId,
      });
      return true;
    } catch (error) {
      console.error("Google Calendar connection test failed:", error);
      return false;
    }
  }
}
