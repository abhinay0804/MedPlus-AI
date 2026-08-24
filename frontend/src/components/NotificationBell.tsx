import React, { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'
import { Bell, Check, Trash2, X, ClipboardList, Info, Calendar, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'

interface InAppNotification {
  id: string
  user_id: string
  title: string
  body: string
  type: string
  is_read: boolean
  link: string | null
  created_at: string
}

export const NotificationBell: React.FC = () => {
  const [notifications, setNotifications] = useState<InAppNotification[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    fetchNotifications()
    // Poll notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const fetchNotifications = async () => {
    try {
      const data = await api.get<InAppNotification[]>('/auth/notifications')
      setNotifications(data)
    } catch (err) {
      console.error('Failed to fetch notifications:', err)
    }
  }

  const handleMarkRead = async (id: string, link: string | null) => {
    try {
      await api.put(`/auth/notifications/${id}/read`, {})
      fetchNotifications()
      setIsOpen(false)
      if (link) {
        navigate(link)
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to mark notification as read')
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await api.put('/auth/notifications/read-all', {})
      toast.success('All notifications marked as read!')
      fetchNotifications()
      setIsOpen(false)
    } catch (err: any) {
      toast.error(err.message || 'Failed to clear notifications')
    }
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'appointment':
        return <Calendar className="w-4 h-4 text-teal-600" />
      case 'admin_note':
        return <ClipboardList className="w-4 h-4 text-red-600" />
      case 'medication':
        return <Sparkles className="w-4 h-4 text-amber-600 animate-pulse" />
      default:
        return <Info className="w-4 h-4 text-slate-500" />
    }
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-600 animate-ping" />
        )}
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-600" />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 md:right-auto md:left-0 mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 overflow-hidden flex flex-col max-h-96">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between">
            <span className="font-bold text-xs text-slate-900 dark:text-white uppercase tracking-wider">Notifications ({unreadCount} unread)</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[10px] font-extrabold text-teal-650 hover:text-teal-700 dark:text-teal-400 cursor-pointer"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1 divide-y divide-slate-100 dark:divide-slate-850">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 italic">No notifications yet.</div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleMarkRead(notif.id, notif.link)}
                  className={`p-4 text-left flex items-start space-x-3 cursor-pointer transition ${
                    notif.is_read ? 'hover:bg-slate-50/50 dark:hover:bg-slate-800/20' : 'bg-teal-500/5 dark:bg-teal-500/5 hover:bg-teal-500/10'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">{getIcon(notif.type)}</div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className={`text-xs font-semibold truncate ${notif.is_read ? 'text-slate-700 dark:text-slate-300' : 'text-slate-900 dark:text-white'}`}>
                      {notif.title}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">{notif.body}</p>
                    <span className="text-[9px] text-slate-400 block pt-1">
                      {new Date(notif.created_at + 'Z').toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
