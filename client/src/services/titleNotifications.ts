/**
 * Title Notification Service
 * Handles flashing the page title to indicate new messages
 */

class TitleNotificationService {
  private originalTitle: string = '';
  private isFlashing: boolean = false;
  private flashInterval: number | null = null;
  private unreadCount: number = 0;

  constructor() {
    this.originalTitle = document.title;
  }

  /**
   * Start flashing the title with a message
   */
  public startFlashing(message: string = 'New message!'): void {
    if (this.isFlashing) {
      return;
    }

    this.isFlashing = true;
    let showOriginal = false;

    this.flashInterval = window.setInterval(() => {
      if (showOriginal) {
        document.title = this.originalTitle;
      } else {
        document.title = message;
      }
      showOriginal = !showOriginal;
    }, 1000);
  }

  /**
   * Stop flashing the title
   */
  public stopFlashing(): void {
    if (this.flashInterval !== null) {
      window.clearInterval(this.flashInterval);
      this.flashInterval = null;
    }
    this.isFlashing = false;
    this.updateTitle();
  }

  /**
   * Set the unread message count
   */
  public setUnreadCount(count: number): void {
    this.unreadCount = Math.max(0, count);
    this.updateTitle();
  }

  /**
   * Increment the unread message count
   */
  public incrementUnreadCount(): void {
    this.unreadCount++;
    this.updateTitle();
  }

  /**
   * Clear the unread message count
   */
  public clearUnreadCount(): void {
    this.unreadCount = 0;
    this.updateTitle();
  }

  /**
   * Update the document title with unread count
   */
  private updateTitle(): void {
    if (this.isFlashing) {
      return;
    }

    if (this.unreadCount > 0) {
      const countText = this.unreadCount > 99 ? '(99+)' : `(${this.unreadCount})`;
      document.title = `${countText} ${this.originalTitle}`;
    } else {
      document.title = this.originalTitle;
    }
  }

  /**
   * Reset to original title
   */
  public reset(): void {
    this.stopFlashing();
    this.clearUnreadCount();
  }

  /**
   * Set the base title (useful when changing pages)
   */
  public setBaseTitle(title: string): void {
    this.originalTitle = title;
    this.updateTitle();
  }
}

// Export a singleton instance
export const titleNotifications = new TitleNotificationService();
