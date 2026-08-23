from fastapi import HTTPException, status

class SlotConflictError(HTTPException):
    def __init__(self, detail: str = "Requested appointment slot is already booked or on hold"):
        super().__init__(status_code=status.HTTP_409_CONFLICT, detail=detail)

class LLMFailureError(HTTPException):
    def __init__(self, detail: str = "AI summary service encountered an error"):
        super().__init__(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=detail)

class NotFoundError(HTTPException):
    def __init__(self, detail: str = "Requested resource was not found"):
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail)

class UnauthorizedError(HTTPException):
    def __init__(self, detail: str = "Authentication credentials required"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"}
        )

class ForbiddenError(HTTPException):
    def __init__(self, detail: str = "You do not have permission to access this resource"):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail)
