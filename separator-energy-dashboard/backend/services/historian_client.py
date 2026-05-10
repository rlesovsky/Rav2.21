"""Dispatcher that selects the i3X client or the legacy REST client at import time.

Public surface used by the rest of the backend:

    fetch_current_values()
    fetch_all_tags(start=None, end=None)
    startup()
    shutdown()

`fetch_tag_history` is intentionally not re-exported: i3X expects a logical
tag name as the first argument, while the legacy client expects a full
historian path. External callers should go through `fetch_all_tags`.
"""

import logging

from config import USE_I3X
from services import i3x_client, timebase_client_legacy

logger = logging.getLogger(__name__)

if USE_I3X:
    logger.info("historian_client: using i3X 1.0-Beta backend")
    fetch_current_values = i3x_client.fetch_current_values
    fetch_all_tags = i3x_client.fetch_all_tags
    startup = i3x_client.startup
    shutdown = i3x_client.shutdown
else:
    logger.info("historian_client: using legacy TimeBase REST backend")
    fetch_current_values = timebase_client_legacy.fetch_current_values
    fetch_all_tags = timebase_client_legacy.fetch_all_tags

    async def startup() -> None:
        # Legacy client has no startup probe; validate_configuration is a no-op.
        await timebase_client_legacy.validate_configuration()

    async def shutdown() -> None:
        return None
