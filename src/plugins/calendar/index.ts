import { BasePlugin } from "../basePlugin";
import { CalendarEvent, GoogleCalendarService } from "./GoogleCalendarService";
import { DateTime } from "luxon";

/**
 * Utility function to convert rem units to pixels
 */
function rem(value: number) {
  return Math.round(value * 20);
}

function checkOverlap<T extends number | DateTime>(a: [T, T], b: [T, T]) {
  return !(a[0] >= b[1] || a[1] <= b[0]);
}

interface CalendarConfig {
  googleCalendar: {
    serviceAccountKeyPath: string;
    calendarId?: string;
    calendarIds?: string[]; // Support for multiple calendars
  };
  timezone?: string;
  startDay?: "monday" | "sunday";
  startHour: string;
  endHour: string;
}

function parseHumanHour(hour: string): number {
  if (typeof hour === "number") {
    return hour;
  }

  hour = hour.toLowerCase();
  if (hour.endsWith("am")) return +hour.slice(0, -2);
  if (hour.endsWith("pm")) return +hour.slice(0, -2) + 12;

  if (hour.endsWith("h00") || hour.endsWith(":00")) return +hour.slice(0, -3);

  throw new Error(`Invalid hour: ${hour}`);
}

/**
 * Calendar plugin that displays a week view with Google Calendar events
 */
export class CalendarPlugin extends BasePlugin<CalendarConfig> {
  private calendarService: GoogleCalendarService | null = null;

  readonly styles = {
    textColor: "#000000",
    gridColor: "#cccccc",
    eventBackgroundColor: "#000000",
    eventTextColor: "#ffffff",
    eventBorderColor: "#ffffff",

    timeColumnWidth: 80,
    headerHeight: 60,

    fontFamily: "Courier",

    headerFontSize: rem(1.4),
    eventFontSize: rem(1.4),
    hoursFontSize: rem(0.8),
  };

  startHour = 8;
  endHour = 22;
  get totalHours() {
    return this.endHour - this.startHour;
  }

  fontStr(fontSize: number) {
    return `bold ${fontSize}px ${this.styles.fontFamily}`;
  }

  get dayWidth() {
    return (this.width - this.styles.timeColumnWidth) / 7;
  }

  /**
   * Returns the current date and time in the configured timezone
   */
  now() {
    return DateTime.now().setZone(this.config.timezone);
  }

  async onStart(): Promise<void> {
    this.startHour = parseHumanHour(this.config.startHour);
    this.endHour = parseHumanHour(this.config.endHour);

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
      const { startOfWeek, endOfWeek } = this.getWeekBounds(this.now());
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
  private getWeekBounds(date: DateTime): {
    startOfWeek: DateTime;
    endOfWeek: DateTime;
  } {
    const startDay = this.config.startDay || "monday";

    // Calculate start of week
    let startOfWeek: DateTime;
    if (startDay === "monday") {
      startOfWeek = date.startOf("week"); // Monday is default start of week for Luxon
    } else {
      // For Sunday start, we need to adjust
      startOfWeek =
        date.weekday === 7
          ? date.startOf("day")
          : date.startOf("week").minus({ days: 1 });
    }

    const endOfWeek = startOfWeek.plus({ days: 7 }).startOf("day");

    return { startOfWeek, endOfWeek };
  }

  /**
   * Draw the week view calendar
   */
  private async drawWeekView(
    startOfWeek: DateTime,
    events: CalendarEvent[],
  ): Promise<void> {
    const ctx = this.ctx;
    const width = this.screenWidth;
    const height = this.screenHeight;

    // Clear background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    this.drawHeader(startOfWeek);
    this.drawVerticalGrid();

    const allDayEvents = events.filter((event) => event.allDay);
    const allDayEventsHeight = this.drawAllDayEvents(allDayEvents);

    this.drawTimeGrid(allDayEventsHeight);

    // Group events by day and type
    const eventsByDay = this.groupEventsByDay(
      startOfWeek,
      events.filter((e) => !e.allDay),
    );

    const timeGridStart = this.styles.headerHeight + allDayEventsHeight;

    // Draw events for each day
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const dayX = this.styles.timeColumnWidth + dayIndex * this.dayWidth;
      const day = startOfWeek.plus({ days: dayIndex }).startOf("day");
      const isToday = day.hasSame(this.now(), "day");
      this.drawTimedEvents(eventsByDay[dayIndex], dayX, timeGridStart, isToday);
    }
  }

  /**
   * Draws the the name and dates of each day of the week at the top of the screen
   */
  private drawHeader(startOfWeek: DateTime) {
    const ctx = this.ctx;
    const timeColumnWidth = this.styles.timeColumnWidth;
    const dayWidth = this.dayWidth;
    const gridColor = this.styles.gridColor;
    const textColor = this.styles.textColor;
    const headerHeight = this.styles.headerHeight;

    // Draw day headers
    ctx.fillStyle = textColor;
    ctx.font = this.fontStr(this.styles.headerFontSize);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const dayNames = this.getDayNames();
    const today = this.now().startOf("day");

    for (let i = 0; i < 7; i++) {
      const date = startOfWeek.plus({ days: i }).startOf("day");

      const x = timeColumnWidth + i * dayWidth + dayWidth / 2;
      const y = headerHeight / 2;

      // Check if this is today
      const isToday = date.hasSame(today, "day");

      // Day name and date
      const dayText = `${dayNames[i]} ${date.month}/${date.day}`;
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
  }

  private drawVerticalGrid(): void {
    const ctx = this.ctx;

    // Draw vertical grid lines between days
    ctx.strokeStyle = this.styles.gridColor;
    for (let i = 1; i < 7; i++) {
      ctx.beginPath();
      ctx.moveTo(this.styles.timeColumnWidth + i * this.dayWidth, 0);
      ctx.lineTo(this.styles.timeColumnWidth + i * this.dayWidth, this.height);
      ctx.stroke();
    }

    // Draw time column border
    ctx.beginPath();
    ctx.moveTo(this.styles.timeColumnWidth, 0);
    ctx.lineTo(this.styles.timeColumnWidth, this.height);
    ctx.stroke();
  }

  private drawTimeGrid(allDayHeight: number): void {
    const headerHeight = this.styles.headerHeight;
    const timeGridStart = headerHeight + allDayHeight;
    const ctx = this.ctx;

    // Draw time labels and horizontal grid lines
    ctx.font = this.fontStr(this.styles.hoursFontSize);
    ctx.textAlign = "right";

    const hourHeight =
      (this.height - headerHeight - allDayHeight) / this.totalHours;

    for (let hour = this.startHour; hour <= this.endHour; hour++) {
      const y = timeGridStart + (hour - this.startHour) * hourHeight;

      // Time label
      const timeText =
        hour === 12
          ? "12:00pm"
          : hour > 12
            ? `${hour - 12}:00pm`
            : hour === 0
              ? "12:00am"
              : `${hour}:00am`;

      ctx.fillStyle = this.styles.textColor;
      ctx.fillText(timeText, this.styles.timeColumnWidth - 5, y + 4);

      // Horizontal grid line (dotted)
      ctx.strokeStyle = this.styles.gridColor;
      ctx.setLineDash([10, 10]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.styles.timeColumnWidth, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private drawAllDayEvents(events: CalendarEvent[]): number {
    if (!events.length) return 0;

    const lines = [] as CalendarEvent[][];
    const remainingEvents = events.slice();
    remainingEvents.sort((a, b) => {
      return +a.start - +b.start;
    });

    while (remainingEvents.length) {
      let line = [...remainingEvents];
      for (let i = 0; i < line.length; i++) {
        const evt = line[i];

        // Checking for overlap
        for (let j = i + 1; j < line.length; j++) {
          const other = line[j];

          if (checkOverlap([evt.start, evt.end], [other.start, other.end])) {
            // Removing this event from the line
            line.splice(j, 1);
            j--;
          }
        }
      }

      for (const evt of line) {
        const idx = remainingEvents.indexOf(evt);
        if (idx !== -1) {
          remainingEvents.splice(idx, 1);
        }
      }

      lines.push(line);
    }

    const ctx = this.ctx;
    const eventHeight = this.styles.eventFontSize + 10;

    const weekBounds = this.getWeekBounds(this.now());

    // Now, we have the events organized in lines, and we know that
    // within each line, there are no overlapping events.
    // We draw the lines in order
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const top = this.styles.headerHeight + i * eventHeight;

      for (const evt of line) {
        const dow = evt.start.diff(weekBounds.startOfWeek, "days").days;
        const duration = evt.end.diff(evt.start, "day").days;

        const x = this.styles.timeColumnWidth + dow * this.dayWidth;
        const width = duration * this.dayWidth - 10;

        // Drawing the box
        ctx.fillStyle = "#000000";
        ctx.beginPath();
        ctx.roundRect(x, top, width, eventHeight, 7);
        ctx.fill();

        // Drawing the border
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x, top, width, eventHeight, 7);
        ctx.stroke();

        // Drawing the text
        ctx.fillStyle = "#ffffff";
        const lineHeight = rem(1.3);
        ctx.font = this.fontStr(this.styles.eventFontSize);
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        const title = evt.summary || "Untitled";
        ctx.fillText(title, x + 4, top + lineHeight / 2 + 10);
      }
    }

    return lines.length * eventHeight;
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
    startOfWeek: DateTime,
    events: CalendarEvent[],
  ): CalendarEvent[][] {
    const eventsByDay: CalendarEvent[][] = Array(7)
      .fill(null)
      .map(() => []);

    events.forEach((event) => {
      const eventDate = event.start;
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
   * Get the day index (0-6) for a given date within the week
   */
  private getDayIndex(startOfWeek: DateTime, date: DateTime): number {
    const daysDiff = Math.floor(
      date.startOf("day").diff(startOfWeek.startOf("day"), "days").days,
    );
    return daysDiff;
  }

  private processEventMultilineTitle(
    ctx: typeof this.ctx,
    maxWidth: number,
    maxHeight: number,
    title: string,
  ): string[] {
    const words = title.split(" ");
    const lineHeight = rem(1.3);
    ctx.font = this.fontStr(lineHeight);
    let currentY = 0;

    let line = "";
    let lines = [] as string[];
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const testLine = line + (line ? " " : "") + word;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && line) {
        // Draw the current line
        if (currentY + lineHeight <= maxHeight) {
          lines.push(line);
          line = word;
          currentY += lineHeight;
        } else {
          // No more space, truncate current line
          const truncated = this.truncateText(line, maxWidth, ctx);
          lines.push(truncated);
          break;
        }
      } else {
        line = testLine;
      }
    }
    if (line.length > 0) {
      lines.push(line);
    }

    return lines;
  }

  /**
   * Draw timed events positioned according to their time
   */
  private drawTimedEvents(
    events: CalendarEvent[],
    dayX: number,
    timeGridStart: number,
    drawCurrentTime = false,
  ): void {
    const ctx = this.ctx;
    const sectionHeight = this.height - timeGridStart;
    const hourHeight = sectionHeight / this.totalHours;
    const dayWidth = this.dayWidth;

    // Sort events by start time to handle overlaps better
    events.sort((a, b) => {
      return +a.start - +b.start;
    });

    // Filtering out events outside of the time range
    events = events.filter((evt) => {
      return evt.end.hour > this.startHour && evt.start.hour < this.endHour;
    });

    ctx.font = this.fontStr(this.styles.eventFontSize);
    ctx.textAlign = "left";

    /**
     * Value used to know how much space at the top of the event
     * we should keep visible
     */
    const titleHeight = 40;

    const evts = events.map((evt) => {
      let start = evt.start;
      let end = evt.end;
      if (start.hour < this.startHour) {
        start = start.set({ hour: this.startHour - 1, minute: 55 });
      }
      if (end.hour > this.endHour) {
        end = end.set({ hour: this.endHour, minute: 5 });
      }

      const durationMs = +end - +start;
      const durationHours = durationMs / 1000 / 60 / 60;

      const top =
        timeGridStart +
        (start.hour + start.minute / 60 - this.startHour) * hourHeight;

      return {
        evt,
        top,
        height: hourHeight * durationHours,
        bottom: top + hourHeight * durationHours,
      };
    });

    const placedEvents = [] as [number, (typeof evts)[0]][];

    for (const event of evts) {
      // Does this event collide with any of the already placed events?
      const collidingEvents = placedEvents.filter(([x, evt]) => {
        return checkOverlap([event.top, event.bottom], [evt.top, evt.bottom]);
      });

      // sorting the collision by x
      collidingEvents.sort((a, b) => b[0] - a[0]);

      // Looking for a way to go behind the events
      let foundSpot = false;
      const maxX = Math.max(...placedEvents.map(([x]) => x));
      for (let x = 0; x < maxX; x++) {
        // Is there an event at this position?
        const collidingEvent = collidingEvents.find(
          ([evtX]) => evtX >= x && evtX < x + 1,
        );
        if (!collidingEvent) {
          // No event at this position, we can place this event
          placedEvents.push([x, event]);
          foundSpot = true;
          break;
        }
      }
      if (foundSpot) continue;

      const highestCollidingEvent = collidingEvents[0];

      if (!highestCollidingEvent) {
        // No collision, we can place this event
        placedEvents.push([0, event]);
        continue;
      }

      // We check if we're colliding with the title or not
      if (event.top < highestCollidingEvent[1].top + titleHeight) {
        // We collide with the title
        placedEvents.push([highestCollidingEvent[0] + 1, event]);
      } else {
        // We collide but not with the title!
        placedEvents.push([highestCollidingEvent[0] + 0.2, event]);
      }
    }

    const maxX = Math.max(...placedEvents.map(([x]) => x)) + 1;

    // Calculating the bbox of each event
    const bboxes = [] as {
      top: number;
      left: number;
      bottom: number;
      width: number;
      height: number;
      title: string[];
    }[];
    // Sorting the events by x position
    placedEvents.sort((a, b) => a[0] - b[0]);
    for (const [x, evt] of placedEvents) {
      // If there is someone colliding with the title AFTER this event,
      // we extend this event until the collision point
      //
      // Otherwise:
      //   If there is someone colliding with the title BEFORE this event,
      //     We extend until end of width - 10px
      //   Otherwise:
      //     We extend until end of width
      const collidingEventsAfter = [] as [number, (typeof evts)[0]][];
      const collidingEventsBefore = [] as [number, (typeof evts)[0]][];

      for (const [_x, _evt] of placedEvents) {
        if (_evt === evt) continue;
        // We check if the title collides with another event
        const doesCollide = checkOverlap(
          [evt.top, Math.min(evt.bottom, evt.top + titleHeight)],
          [_evt.top, _evt.bottom],
        );

        if (!doesCollide) continue;

        if (_x < x) {
          collidingEventsBefore.push([_x, _evt]);
        } else {
          collidingEventsAfter.push([_x, _evt]);
        }
      }

      const xOffset = (x / maxX) * dayWidth;
      const left = dayX + 2 + xOffset;

      if (!collidingEventsAfter.length) {
        // No collisions at all, the event takes the whole width
        bboxes.push({
          top: evt.top,
          left,
          bottom: evt.bottom,
          width: dayWidth - xOffset - 4,
          height: evt.height,
          title: this.processEventMultilineTitle(
            ctx,
            dayWidth,
            evt.height,
            evt.evt.summary || "Untitled",
          ),
        });
        continue;
      }

      if (collidingEventsAfter.length) {
        // There are collisions after this event, we extend until the start of the collision
        // We look for the collision with the smallest X
        const collision = collidingEventsAfter.reduce((a, b) => {
          return a[0] < b[0] ? a : b;
        });
        const collisionX = collision[0];

        const right = dayX + 2 + (collisionX / maxX) * dayWidth;
        const width = right - left;

        bboxes.push({
          top: evt.top,
          bottom: evt.bottom,
          height: evt.height,
          left,
          width,
          title: this.processEventMultilineTitle(
            ctx,
            dayWidth,
            evt.height,
            evt.evt.summary || "Untitled",
          ),
        });
      }
    }

    const radius = 7;

    // Drawing the events
    for (const bbox of bboxes) {
      // Event background (black for grayscale)
      ctx.fillStyle = "#000000";
      ctx.beginPath();
      ctx.roundRect(bbox.left, bbox.top, bbox.width, bbox.height, radius);
      ctx.fill();
      // ctx.fillRect(bbox.left, bbox.top, bbox.width, bbox.height);

      // Event border
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(bbox.left, bbox.top, bbox.width, bbox.height, radius);
      ctx.stroke();

      // Event text (white on black)
      ctx.fillStyle = "#ffffff";
      const lineHeight = rem(1.3);
      ctx.font = this.fontStr(this.styles.eventFontSize);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";

      const titleLines = bbox.title;
      for (let i = 0; i < titleLines.length; i++) {
        const titleLine = titleLines[i];
        const y = bbox.top + i * lineHeight;
        ctx.fillText(titleLine, bbox.left + 4, y + lineHeight / 2 + 10);
      }
    }

    // Draw the current time line
    const now = this.now();
    const canDrawNowBar = now.hour > this.startHour && now.hour < this.endHour;
    if (drawCurrentTime && canDrawNowBar) {
      const timeY =
        timeGridStart +
        (now.hour + now.minute / 60 - this.startHour) * hourHeight;

      // Draw line across today's column only
      ctx.setLineDash([10, 10]);
      ctx.lineWidth = 5;

      // White dashed line
      ctx.beginPath();
      ctx.moveTo(dayX, timeY);
      ctx.lineTo(dayX + dayWidth, timeY);
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();

      // Black dashed line
      ctx.beginPath();
      ctx.moveTo(dayX + 10, timeY);
      ctx.lineTo(dayX + dayWidth, timeY);
      ctx.strokeStyle = "#000000";
      ctx.stroke();

      ctx.setLineDash([]);

      // Draw a small circle at the start and end of the line
      ctx.fillStyle = "#000000";
      ctx.beginPath();
      ctx.arc(dayX, timeY, 8, 0, 2 * Math.PI);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(dayX + dayWidth, timeY, 8, 0, 2 * Math.PI);
      ctx.fill();
    }
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
   * Draw a screen with an error message in its center.
   * Handy when you want to show an error message to the end user.
   */
  private drawErrorMessage(message: string): void {
    const ctx = this.ctx;

    ctx.fillStyle = "#f44336";
    ctx.fillRect(10, 10, this.screenWidth - 20, 50);

    ctx.fillStyle = "#ffffff";
    ctx.font = this.fontStr(this.styles.eventFontSize);
    ctx.textAlign = "center";
    ctx.fillText("Calendar Error", this.screenWidth / 2, 30);

    ctx.font = this.fontStr(this.styles.hoursFontSize);
    const truncatedMessage = this.truncateText(
      message,
      this.screenWidth - 40,
      ctx,
    );
    ctx.fillText(truncatedMessage, this.screenWidth / 2, 50);
  }
}

export default CalendarPlugin;
