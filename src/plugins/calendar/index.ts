import { BasePlugin } from "../basePlugin";
import { CalendarEvent, GoogleCalendarService } from "./GoogleCalendarService";

const FONT = "Courier";

/**
 * Utility function to convert rem units to pixels
 */
function rem(value: number) {
  return Math.round(value * 20);
}

interface CalendarConfig {
  googleCalendar: {
    serviceAccountKeyPath: string;
    calendarId?: string;
    calendarIds?: string[]; // Support for multiple calendars
  };
  timezone?: string;
  startDay?: "monday" | "sunday";
  showTimeSlots?: boolean;
  maxEventsPerDay?: number;
  dateFormat?: string;
}

/**
 * Calendar plugin that displays a week view with Google Calendar events
 */
export class CalendarPlugin extends BasePlugin<CalendarConfig> {
  private calendarService: GoogleCalendarService | null = null;

  async onStart(): Promise<void> {
    try {
      await this.initializeService();
      this.log("Calendar plugin initialized successfully", "info");
    } catch (error) {
      this.log(`Failed to initialize calendar plugin: ${error}`, "error");
    }
  }

  async onStop(): Promise<void> {
    this.calendarService = null;
    this.log("Calendar plugin stopped", "info");
  }

  protected async draw(): Promise<void> {
    if (!this.calendarService) {
      return this.drawErrorMessage("Calendar service not initialized");
    }

    try {
      const { startOfWeek, endOfWeek } = this.getWeekBounds(new Date());
      const events = await this.calendarService.getWeekEvents(
        startOfWeek,
        endOfWeek,
      );

      await this.drawWeekView(startOfWeek, events);
    } catch (error) {
      this.log(`Failed to fetch events: ${error}`, "error");
      return this.drawErrorMessage(`Failed to load calendar: ${error}`);
    }
  }

  /**
   * Initialize the Google Calendar service
   */
  private async initializeService(): Promise<void> {
    if (!GoogleCalendarService.isValidConfig(this.config.googleCalendar)) {
      throw new Error("Invalid Google Calendar configuration");
    }

    this.calendarService = new GoogleCalendarService(
      this.config.googleCalendar,
    );

    // Initialize the service account authentication
    await this.calendarService.initialize();

    // Test the connection
    const isConnected = await this.calendarService.testConnection();
    if (!isConnected) {
      throw new Error("Failed to connect to Google Calendar API");
    }
  }

  /**
   * Calculate week boundaries based on configuration
   */
  private getWeekBounds(date: Date): { startOfWeek: Date; endOfWeek: Date } {
    const startDay = this.config.startDay || "monday";
    const currentDate = new Date(date);

    // Calculate start of week
    const dayOfWeek = currentDate.getDay();
    let daysToSubtract: number;

    if (startDay === "monday") {
      daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    } else {
      daysToSubtract = dayOfWeek;
    }

    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - daysToSubtract);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);
    endOfWeek.setHours(0, 0, 0, 0);

    return { startOfWeek, endOfWeek };
  }

  /**
   * Draw the week view calendar
   */
  private async drawWeekView(
    startOfWeek: Date,
    events: CalendarEvent[],
  ): Promise<void> {
    const ctx = this.ctx;
    const width = this.screenWidth;
    const height = this.screenHeight;

    // Colors for grayscale display
    const backgroundColor = "#ffffff";
    const textColor = "#000000";
    const gridColor = "#cccccc";

    // Layout constants
    const headerHeight = 60;
    const allDayHeight = 40;
    const timeColumnWidth = 80;
    const dayWidth = (width - timeColumnWidth) / 7;
    const timeGridHeight = height - headerHeight - allDayHeight;

    // Time range: 8am to 10pm (14 hours)
    const startHour = 8;
    const endHour = 22;
    const totalHours = endHour - startHour;
    const hourHeight = timeGridHeight / totalHours;

    // Clear background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    // Draw day headers
    ctx.fillStyle = textColor;
    ctx.font = `bold ${rem(1.4)}px ${FONT}`;
    ctx.textAlign = "center";

    const dayNames = this.getDayNames();
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to start of day

    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      date.setHours(0, 0, 0, 0); // Normalize to start of day

      const x = timeColumnWidth + i * dayWidth + dayWidth / 2;
      const y = 40;

      // Check if this is today
      const isToday = date.getTime() === today.getTime();

      // Day name and date
      const dayText = `${dayNames[i]} ${date.getMonth() + 1}/${date.getDate()}`;
      ctx.fillText(dayText, x, y);

      // Draw day header border
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(timeColumnWidth + i * dayWidth, 0, dayWidth, headerHeight);

      // Frame the current day with a thick border
      if (isToday) {
        ctx.strokeStyle = textColor;
        ctx.lineWidth = 5;
        ctx.strokeRect(
          timeColumnWidth + i * dayWidth + 2,
          2,
          dayWidth - 4,
          headerHeight - 4,
        );
      }
    }

    // Draw all-day events section
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, headerHeight);
    ctx.lineTo(width, headerHeight);
    ctx.moveTo(0, headerHeight + allDayHeight);
    ctx.lineTo(width, headerHeight + allDayHeight);
    ctx.stroke();

    // Draw time grid
    const timeGridStart = headerHeight + allDayHeight;

    // Draw time labels and horizontal grid lines
    ctx.font = `bold ${rem(0.8)}px ${FONT}`;
    ctx.textAlign = "right";

    for (let hour = startHour; hour <= endHour; hour++) {
      const y = timeGridStart + (hour - startHour) * hourHeight;

      // Time label
      const timeText =
        hour === 12
          ? "12:00pm"
          : hour > 12
            ? `${hour - 12}:00pm`
            : hour === 0
              ? "12:00am"
              : `${hour}:00am`;
      ctx.fillStyle = textColor;
      ctx.fillText(timeText, timeColumnWidth - 5, y + 4);

      // Horizontal grid line (dotted)
      ctx.strokeStyle = gridColor;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(timeColumnWidth, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw vertical grid lines between days
    ctx.strokeStyle = gridColor;
    for (let i = 1; i < 7; i++) {
      ctx.beginPath();
      ctx.moveTo(timeColumnWidth + i * dayWidth, 0);
      ctx.lineTo(timeColumnWidth + i * dayWidth, height);
      ctx.stroke();
    }

    // Draw time column border
    ctx.beginPath();
    ctx.moveTo(timeColumnWidth, 0);
    ctx.lineTo(timeColumnWidth, height);
    ctx.stroke();

    // Group events by day and type
    const eventsByDay = this.groupEventsByDay(startOfWeek, events);

    // Draw events for each day
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const dayEvents = eventsByDay[dayIndex] || [];
      this.drawTimeBasedDayEvents(
        dayIndex,
        dayEvents,
        dayWidth,
        headerHeight,
        allDayHeight,
        timeGridStart,
        hourHeight,
        startHour,
        endHour,
        timeColumnWidth,
      );
    }

    // Draw current time indicator line on today's date
    this.drawCurrentTimeIndicator(
      startOfWeek,
      timeColumnWidth,
      dayWidth,
      timeGridStart,
      hourHeight,
      startHour,
      endHour,
      width,
      events,
    );
  }

  /**
   * Get day names based on start day configuration
   */
  private getDayNames(): string[] {
    const mondayFirst = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const sundayFirst = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    return this.config.startDay === "sunday" ? sundayFirst : mondayFirst;
  }

  /**
   * Group events by day of the week
   */
  private groupEventsByDay(
    startOfWeek: Date,
    events: CalendarEvent[],
  ): CalendarEvent[][] {
    const eventsByDay: CalendarEvent[][] = Array(7)
      .fill(null)
      .map(() => []);

    events.forEach((event) => {
      const eventDate = this.getEventDate(event);
      if (eventDate) {
        const dayIndex = this.getDayIndex(startOfWeek, eventDate);
        if (dayIndex >= 0 && dayIndex < 7) {
          eventsByDay[dayIndex].push(event);
        }
      }
    });

    return eventsByDay;
  }

  /**
   * Get the date of an event (handles both dateTime and date formats)
   */
  private getEventDate(event: CalendarEvent): Date | null {
    if (event.start.dateTime) {
      return new Date(event.start.dateTime);
    } else if (event.start.date) {
      return new Date(event.start.date);
    }
    return null;
  }

  /**
   * Get the day index (0-6) for a given date within the week
   */
  private getDayIndex(startOfWeek: Date, date: Date): number {
    const daysDiff = Math.floor(
      (date.getTime() - startOfWeek.getTime()) / (24 * 60 * 60 * 1000),
    );
    return daysDiff;
  }

  /**
   * Draw events for a specific day with time-based positioning
   */
  private drawTimeBasedDayEvents(
    dayIndex: number,
    events: CalendarEvent[],
    dayWidth: number,
    headerHeight: number,
    allDayHeight: number,
    timeGridStart: number,
    hourHeight: number,
    startHour: number,
    endHour: number,
    timeColumnWidth: number,
  ): void {
    const dayX = timeColumnWidth + dayIndex * dayWidth;

    // Separate all-day and timed events
    const allDayEvents: CalendarEvent[] = [];
    const timedEvents: CalendarEvent[] = [];

    events.forEach((event) => {
      if (this.isAllDayEvent(event)) {
        allDayEvents.push(event);
      } else {
        timedEvents.push(event);
      }
    });

    // Draw all-day events
    this.drawAllDayEvents(
      allDayEvents,
      dayX,
      headerHeight,
      dayWidth,
      allDayHeight,
    );

    // Draw timed events
    this.drawTimedEvents(
      timedEvents,
      dayX,
      timeGridStart,
      dayWidth,
      hourHeight,
      startHour,
      endHour,
    );
  }

  /**
   * Check if an event is all-day
   */
  private isAllDayEvent(event: CalendarEvent): boolean {
    return !event.start.dateTime || event.allDay === true;
  }

  /**
   * Draw all-day events in the all-day section
   */
  private drawAllDayEvents(
    events: CalendarEvent[],
    dayX: number,
    headerHeight: number,
    dayWidth: number,
    allDayHeight: number,
  ): void {
    const ctx = this.ctx;
    const eventHeight = 20;
    const maxEvents = Math.floor(allDayHeight / eventHeight);
    const displayEvents = events.slice(0, maxEvents);

    ctx.font = `bold ${rem(1.3)}px ${FONT}`;
    ctx.textAlign = "left";

    displayEvents.forEach((event, index) => {
      const eventY = headerHeight + 5 + index * eventHeight;
      const eventWidth = dayWidth - 4;
      const eventX = dayX + 2;

      // Event background (black for grayscale)
      ctx.fillStyle = "#000000";
      ctx.fillRect(eventX, eventY, eventWidth, eventHeight - 2);

      // Event text (white on black)
      ctx.fillStyle = "#ffffff";
      const title = event.summary || "Untitled";

      // Handle multi-line text for all-day events
      this.drawMultiLineText(
        title,
        eventX + 4,
        eventY + 18,
        eventWidth - 8,
        eventHeight - 4,
        ctx,
      );
    });
  }

  /**
   * Draw timed events positioned according to their time
   */
  private drawTimedEvents(
    events: CalendarEvent[],
    dayX: number,
    timeGridStart: number,
    dayWidth: number,
    hourHeight: number,
    startHour: number,
    endHour: number,
  ): void {
    const ctx = this.ctx;

    // Sort events by start time to handle overlaps better
    events.sort((a, b) => {
      const aTime = new Date(a.start.dateTime!).getTime();
      const bTime = new Date(b.start.dateTime!).getTime();
      return aTime - bTime;
    });

    ctx.font = `bold ${rem(1.3)}px ${FONT}`;
    ctx.textAlign = "left";

    events.forEach((event) => {
      const startTime = new Date(event.start.dateTime!);
      const endTime = event.end?.dateTime
        ? new Date(event.end.dateTime)
        : new Date(startTime.getTime() + 60 * 60 * 1000); // Default 1 hour

      const startMinutes = startTime.getHours() + startTime.getMinutes() / 60;
      const endMinutes = endTime.getHours() + endTime.getMinutes() / 60;

      // Only draw if within our time range
      if (startMinutes >= startHour && startMinutes < endHour) {
        const eventStartY =
          timeGridStart + (startMinutes - startHour) * hourHeight;
        const duration = Math.max(0.5, endMinutes - startMinutes); // Minimum 30 minutes
        const eventHeight = Math.min(duration * hourHeight, hourHeight * 2); // Cap at 2 hours height

        const eventWidth = dayWidth - 4;
        const eventX = dayX + 2;

        // Event background (black for grayscale)
        ctx.fillStyle = "#000000";
        ctx.fillRect(eventX, eventStartY, eventWidth, eventHeight);

        // Event border
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.strokeRect(eventX, eventStartY, eventWidth, eventHeight);

        // Event text (white on black)
        ctx.fillStyle = "#ffffff";
        const title = event.summary || "Untitled";
        const timeStr = this.formatEventTime(event.start.dateTime!);

        // Handle multi-line text for timed events
        let textStartY = eventStartY + 24;
        const availableHeight = eventHeight - 8;

        // Draw time first if there's enough space
        if (eventHeight > 50) {
          ctx.font = `bold ${rem(0.8)}px ${FONT}`;
          ctx.fillText(timeStr, eventX + 4, eventStartY + 18);
          textStartY = eventStartY + 40;
          ctx.font = `bold ${rem(1.3)}px ${FONT}`;
        }

        // Draw title with multi-line support
        this.drawMultiLineText(
          title,
          eventX + 4,
          textStartY,
          eventWidth - 8,
          availableHeight - (textStartY - eventStartY),
          ctx,
        );
      }
    });
  }

  /**
   * Format event time for display
   */
  private formatEventTime(dateTime: string): string {
    const date = new Date(dateTime);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  /**
   * Truncate text to fit within specified width
   */
  private truncateText(text: string, maxWidth: number, ctx: any): string {
    const metrics = ctx.measureText(text);
    if (metrics.width <= maxWidth) {
      return text;
    }

    let truncated = text;
    while (truncated.length > 0) {
      truncated = truncated.slice(0, -1);
      const testText = truncated + "...";
      if (ctx.measureText(testText).width <= maxWidth) {
        return testText;
      }
    }
    return "...";
  }

  /**
   * Draw multi-line text with word wrapping
   */
  private drawMultiLineText(
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    maxHeight: number,
    ctx: any,
  ): void {
    const words = text.split(" ");
    const lineHeight = 22; // Slightly larger than 20px font
    let line = "";
    let currentY = y;

    for (let i = 0; i < words.length; i++) {
      const testLine = line + (line ? " " : "") + words[i];
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && line) {
        // Draw the current line
        if (currentY - y + lineHeight <= maxHeight) {
          ctx.fillText(line, x, currentY);
          line = words[i];
          currentY += lineHeight;
        } else {
          // No more space, truncate current line
          const truncated = this.truncateText(line, maxWidth, ctx);
          ctx.fillText(truncated, x, currentY);
          break;
        }
      } else {
        line = testLine;
      }
    }

    // Draw the last line if there's space
    if (line && currentY - y + lineHeight <= maxHeight) {
      const finalText =
        ctx.measureText(line).width > maxWidth
          ? this.truncateText(line, maxWidth, ctx)
          : line;
      ctx.fillText(finalText, x, currentY);
    }
  }

  /**
   * Draw a screen with an error message in its center.
   * Handy when you want to show an error message to the end user.
   */
  private drawErrorMessage(message: string): void {
    const ctx = this.ctx;

    ctx.fillStyle = "#f44336";
    ctx.fillRect(10, 10, this.screenWidth - 20, 50);

    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${rem(1.2)}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText("Calendar Error", this.screenWidth / 2, 30);

    ctx.font = `bold ${rem(0.8)}px ${FONT}`;
    const truncatedMessage = this.truncateText(
      message,
      this.screenWidth - 40,
      ctx,
    );
    ctx.fillText(truncatedMessage, this.screenWidth / 2, 50);
  }

  /**
   * Draw a horizontal line indicating the current time on today's date
   */
  private drawCurrentTimeIndicator(
    startOfWeek: Date,
    timeColumnWidth: number,
    dayWidth: number,
    timeGridStart: number,
    hourHeight: number,
    startHour: number,
    endHour: number,
    totalWidth: number,
    events: CalendarEvent[],
  ): void {
    const ctx = this.ctx;
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find which day of the week today is
    let todayDayIndex = -1;
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      date.setHours(0, 0, 0, 0);
      
      if (date.getTime() === today.getTime()) {
        todayDayIndex = i;
        break;
      }
    }

    // Only draw if today is visible in this week view
    if (todayDayIndex === -1) {
      return;
    }

    // Get current time in hours (e.g., 14.5 for 2:30 PM)
    const currentTimeHours = now.getHours() + now.getMinutes() / 60;

    // Only draw if current time is within our display range
    if (currentTimeHours < startHour || currentTimeHours >= endHour) {
      return;
    }

    // Calculate Y position based on current time
    const timeY = timeGridStart + (currentTimeHours - startHour) * hourHeight;

    // Calculate X position for today's column
    const todayColumnX = timeColumnWidth + todayDayIndex * dayWidth;

    // Check if current time overlaps with any event on today
    const isOnEvent = this.isCurrentTimeOnEvent(events, now, today);
    
    // Choose color based on whether we're overlapping an event
    const lineColor = isOnEvent ? "#ffffff" : "#000000";

    // Draw the current time line
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 5;
    ctx.setLineDash([]);

    // Draw line across today's column only
    ctx.beginPath();
    ctx.setLineDash([10, 10]);
    ctx.moveTo(todayColumnX, timeY);
    ctx.lineTo(todayColumnX + dayWidth, timeY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw a small circle at the start and end of the line
    ctx.fillStyle = lineColor;
    ctx.beginPath();
    ctx.arc(todayColumnX, timeY, 8, 0, 2 * Math.PI);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(todayColumnX + dayWidth, timeY, 8, 0, 2 * Math.PI);
    ctx.fill();
  }

  /**
   * Check if the current time overlaps with any event on today
   */
  private isCurrentTimeOnEvent(
    events: CalendarEvent[],
    currentTime: Date,
    today: Date,
  ): boolean {
    // Filter events that are on today
    const todaysEvents = events.filter((event) => {
      const eventDate = this.getEventDate(event);
      if (!eventDate) return false;
      
      const eventDay = new Date(eventDate);
      eventDay.setHours(0, 0, 0, 0);
      
      return eventDay.getTime() === today.getTime();
    });

    // Check if current time falls within any of today's timed events
    for (const event of todaysEvents) {
      // Skip all-day events as they don't have specific times
      if (this.isAllDayEvent(event)) {
        continue;
      }

      if (event.start.dateTime && event.end?.dateTime) {
        const eventStart = new Date(event.start.dateTime);
        const eventEnd = new Date(event.end.dateTime);

        // Check if current time is within this event's time range
        if (currentTime >= eventStart && currentTime <= eventEnd) {
          return true;
        }
      }
    }

    return false;
  }
}

export default CalendarPlugin;
