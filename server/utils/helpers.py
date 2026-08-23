from datetime import datetime, date, time, timedelta

def get_day_name(d: date) -> str:
    """Return lowercase day abbreviation (mon, tue, wed, thu, fri, sat, sun)."""
    days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    return days[d.weekday()]

def parse_time(time_str: str) -> time:
    """Parse HH:MM string to time object."""
    parts = time_str.split(":")
    return time(hour=int(parts[0]), minute=int(parts[1]))

def format_time(t: time) -> str:
    """Format time object to HH:MM string."""
    return t.strftime("%H:%M")
