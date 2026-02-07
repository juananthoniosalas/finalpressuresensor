class PS02Error(Exception):
    """Base error for PS02 API."""


class DeviceNotFoundError(PS02Error):
    """Raised when a PS02 device cannot be found."""


class ConnectionError(PS02Error):
    """Raised when connection/open fails."""


class ProtocolError(PS02Error):
    """Raised when incoming data does not match expected protocol."""
