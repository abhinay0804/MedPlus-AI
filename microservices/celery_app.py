"""
Celery Application
==================
Single Celery app instance shared across all tasks.
Uses Redis as both broker (message transport) and result backend.

Worker start:  PYTHONPATH=. celery -A microservices.celery_app worker --loglevel=info
Beat start:    PYTHONPATH=. celery -A microservices.celery_app beat --loglevel=info
"""

from celery import Celery
from celery.schedules import crontab

from server.config import settings

celery_app = Celery(
    "healthcare",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    # Connection timeouts (prevent 20s blocking in local dev when Redis is offline)
    broker_connection_retry_on_startup=False,
    broker_connection_max_retries=1,
    broker_transport_options={"max_retries": 1, "interval_start": 0, "interval_step": 0, "interval_max": 0},
    # Serialisation
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    # Timezone
    timezone="UTC",
    enable_utc=True,
    # Task result settings
    result_expires=3600,             # Keep results 1 hour
    task_ack_late=True,              # Ack after task completes (safer)
    task_reject_on_worker_lost=True, # Re-queue if worker dies mid-task
    # Autodiscover tasks
    include=["microservices.tasks"],
    # Beat schedule
    beat_schedule={
        # Release expired slot holds every minute
        "release-expired-holds": {
            "task": "microservices.tasks.release_expired_holds_task",
            "schedule": 60.0,  # every 60 seconds
        },
        # Appointment reminder emails every 15 minutes
        "appointment-reminders": {
            "task": "microservices.tasks.send_appointment_reminders_task",
            "schedule": 900.0,  # every 15 minutes
        },
        # Medication reminder emails every 30 minutes
        "medication-reminders": {
            "task": "microservices.tasks.send_medication_reminders_task",
            "schedule": 1800.0,  # every 30 minutes
        },
        # Retry failed LLM summaries every 15 minutes
        "retry-failed-llm": {
            "task": "microservices.tasks.retry_failed_llm_task",
            "schedule": 900.0,
        },
        # Retry failed emails every 5 minutes
        "retry-failed-emails": {
            "task": "microservices.tasks.retry_failed_emails_task",
            "schedule": 300.0,
        },
        # Auto-approve stale pending requests every 5 minutes
        "auto-approve-stale-requests": {
            "task": "microservices.tasks.auto_approve_stale_requests_task",
            "schedule": 300.0,
        },
    },
)
