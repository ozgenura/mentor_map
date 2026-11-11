from . import header_hours, list_rows, multi_rows, side_by_side, tidy_table

ADAPTERS = {
    "header_hours": header_hours.parse,
    "side_by_side": side_by_side.parse,
    "weekly": side_by_side.parse_weekly,
    "tidy_table": tidy_table.parse,
    "list_rows": list_rows.parse,
    "multi_rows": multi_rows.parse,
}
