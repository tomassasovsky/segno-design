# Override checks through Penpot's MCP server

Plugin-API scripts that edit component mains in an imported file and check
that converted copies keep their overrides and still take the main's
changes. Run each with the MCP client (`node mcp.mjs code <file>`) against a
disposable import, with the file open in a logged-in Penpot tab and the MCP
plugin connected. Writes only apply on the active page, so open the page
holding the mains first (`storage.openName = "DS"`, then `open.js`).

1. `p1.js` records every copy head of the tested components, its texts and
   their main counterparts.
2. `p2.js` (on the mains' page) appends " M" to every main text and adds 3 to
   the main's corner radius.
3. `p3.js` counts overridden texts kept or lost, non-overridden texts that
   followed the main, and copies that took the radius.
4. `f1.js` / `f2.js` do the same for fills (main fills set to #FF00AA).
5. `v1.js` / `v2.js` do the same for visibility (main children toggled).
