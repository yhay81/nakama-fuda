import { markVisit, sendEvent } from "/common.js";

const searched = [...new URLSearchParams(location.search).keys()].length > 0;
markVisit();
if (searched) void sendEvent("directory_searched");
