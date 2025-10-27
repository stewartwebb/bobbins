/**
 * Browser Notification Service
 * Handles browser push notifications for new messages and call events
 */

export type NotificationPermissionStatus = 'default' | 'granted' | 'denied';

export interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  requireInteraction?: boolean;
  data?: Record<string, unknown>;
}

class BrowserNotificationService {
  private enabled: boolean = false;
  private permission: NotificationPermissionStatus = 'default';

  constructor() {
    if (this.isSupported()) {
      this.permission = Notification.permission as NotificationPermissionStatus;
      this.enabled = this.permission === 'granted';
    }
  }

  /**
   * Check if browser notifications are supported
   */
  public isSupported(): boolean {
    return 'Notification' in window;
  }

  /**
   * Request notification permission from the user
   */
  public async requestPermission(): Promise<NotificationPermissionStatus> {
    if (!this.isSupported()) {
      console.warn('Browser notifications are not supported');
      return 'denied';
    }

    if (this.permission === 'granted') {
      this.enabled = true;
      return 'granted';
    }

    try {
      const result = await Notification.requestPermission();
      this.permission = result as NotificationPermissionStatus;
      this.enabled = result === 'granted';
      return this.permission;
    } catch (error) {
      console.error('Failed to request notification permission', error);
      return 'denied';
    }
  }

  /**
   * Show a browser notification
   */
  public show(options: NotificationOptions): Notification | null {
    if (!this.isSupported() || !this.enabled || this.permission !== 'granted') {
      return null;
    }

    try {
      const notification = new Notification(options.title, {
        body: options.body,
        icon: options.icon || '/favicon.ico',
        tag: options.tag,
        requireInteraction: options.requireInteraction || false,
        data: options.data,
      });

      // Auto-close notification after 5 seconds unless requireInteraction is true
      if (!options.requireInteraction) {
        setTimeout(() => {
          notification.close();
        }, 5000);
      }

      // Focus window when notification is clicked
      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      return notification;
    } catch (error) {
      console.error('Failed to show notification', error);
      return null;
    }
  }

  /**
   * Show notification for a new message
   */
  public showMessageNotification(
    username: string,
    message: string,
    channelName: string,
    serverName: string
  ): Notification | null {
    return this.show({
      title: `${username} in #${channelName}`,
      body: message,
      tag: `message-${channelName}`,
      data: {
        type: 'message',
        channelName,
        serverName,
      },
    });
  }

  /**
   * Show notification for someone joining a call
   */
  public showCallJoinNotification(
    username: string,
    channelName: string
  ): Notification | null {
    return this.show({
      title: `${username} joined voice`,
      body: `${username} joined #${channelName}`,
      tag: `call-join-${channelName}`,
      data: {
        type: 'call_join',
        channelName,
      },
    });
  }

  /**
   * Get current permission status
   */
  public getPermission(): NotificationPermissionStatus {
    return this.permission;
  }

  /**
   * Check if notifications are enabled
   */
  public isEnabled(): boolean {
    return this.enabled && this.permission === 'granted';
  }

  /**
   * Enable notifications (must have permission first)
   */
  public enable(): void {
    if (this.permission === 'granted') {
      this.enabled = true;
    }
  }

  /**
   * Disable notifications
   */
  public disable(): void {
    this.enabled = false;
  }

  /**
   * Toggle notifications on/off
   */
  public toggle(): boolean {
    if (this.permission !== 'granted') {
      return false;
    }
    this.enabled = !this.enabled;
    return this.enabled;
  }
}

// Export a singleton instance
export const browserNotifications = new BrowserNotificationService();
