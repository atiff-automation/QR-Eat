/**
 * Email Service for sending notifications
 * For development, this will log emails to console
 * In production, integrate with services like SendGrid, AWS SES, etc.
 */

export interface EmailTemplate {
  to: string;
  subject: string;
  htmlContent: string;
  textContent: string;
}

export interface NewRestaurantOwnerEmailData {
  ownerName: string;
  ownerEmail: string;
  restaurantName: string;
  tempPassword: string;
  loginUrl: string;
}

export class EmailService {
  private static isDevelopment = process.env.NODE_ENV === 'development';

  /**
   * Send email (development version logs to console)
   */
  static async sendEmail(template: EmailTemplate): Promise<boolean> {
    try {
      if (this.isDevelopment) {
        console.log(
          '\n==================== EMAIL NOTIFICATION ===================='
        );
        console.log(`TO: ${template.to}`);
        console.log(`SUBJECT: ${template.subject}`);
        console.log('HTML CONTENT:');
        console.log(template.htmlContent);
        console.log('TEXT CONTENT:');
        console.log(template.textContent);
        console.log(
          '============================================================\n'
        );
        return true;
      }

      // In production, integrate with actual email service
      // Example with SendGrid:
      /*
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{
            to: [{ email: template.to }],
            subject: template.subject,
          }],
          from: { email: process.env.FROM_EMAIL },
          content: [
            { type: 'text/plain', value: template.textContent },
            { type: 'text/html', value: template.htmlContent },
          ],
        }),
      });
      
      return response.ok;
      */

      return true;
    } catch (error) {
      console.error('Failed to send email:', error);
      return false;
    }
  }

  /**
   * Send welcome email to new restaurant owner
   */
  static async sendNewRestaurantOwnerEmail(
    data: NewRestaurantOwnerEmailData
  ): Promise<boolean> {
    const template: EmailTemplate = {
      to: data.ownerEmail,
      subject: `Welcome to Tabtep - Your ${data.restaurantName} Account`,
      htmlContent: this.generateNewOwnerHtmlEmail(data),
      textContent: this.generateNewOwnerTextEmail(data),
    };

    return this.sendEmail(template);
  }

  /**
   * Generate HTML email for new restaurant owner
   */
  private static generateNewOwnerHtmlEmail(
    data: NewRestaurantOwnerEmailData
  ): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Welcome to Tabtep</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .credentials { background: #fff; padding: 15px; border-left: 4px solid #2563eb; margin: 20px 0; }
        .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 10px 0; }
        .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
        .warning { background: #fef3cd; border: 1px solid #fecaca; padding: 10px; border-radius: 4px; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome to Tabtep</h1>
        </div>
        
        <div class="content">
            <h2>Hello ${data.ownerName}!</h2>
            
            <p>Welcome to Tabtep! Your restaurant <strong>${data.restaurantName}</strong> has been successfully set up on our platform.</p>
            
            <div class="credentials">
                <h3>Your Login Credentials:</h3>
                <p><strong>Email:</strong> ${data.ownerEmail}</p>
                <p><strong>Temporary Password:</strong> <code>${data.tempPassword}</code></p>
                <p><strong>Login URL:</strong> <a href="${data.loginUrl}">${data.loginUrl}</a></p>
            </div>
            
            <div class="warning">
                <h4>⚠️ Important Security Notice:</h4>
                <ul>
                    <li>This is a temporary password for your first login</li>
                    <li>You will be required to change your password on first login</li>
                    <li>Please keep this information secure and do not share it</li>
                    <li>If you don't login within 7 days, your account may be deactivated</li>
                </ul>
            </div>
            
            <p style="text-align: center;">
                <a href="${data.loginUrl}" class="button">Login to Your Restaurant Dashboard</a>
            </p>
            
            <h3>What's Next?</h3>
            <ol>
                <li>Login using the credentials above</li>
                <li>Change your temporary password</li>
                <li>Complete your restaurant profile</li>
                <li>Set up your menu items</li>
                <li>Configure your table management</li>
                <li>Start accepting orders!</li>
            </ol>
            
            <p>If you have any questions or need assistance, please contact our support team.</p>
            
            <p>Best regards,<br>The Tabtep Team</p>
        </div>
        
        <div class="footer">
            <p>This email was sent to ${data.ownerEmail} because a restaurant account was created for you.</p>
            <p>© 2024 Tabtep. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`;
  }

  /**
   * Generate text email for new restaurant owner
   */
  private static generateNewOwnerTextEmail(
    data: NewRestaurantOwnerEmailData
  ): string {
    return `
Welcome to Tabtep!

Hello ${data.ownerName},

Welcome to Tabtep! Your restaurant "${data.restaurantName}" has been successfully set up on our platform.

YOUR LOGIN CREDENTIALS:
Email: ${data.ownerEmail}
Temporary Password: ${data.tempPassword}
Login URL: ${data.loginUrl}

IMPORTANT SECURITY NOTICE:
- This is a temporary password for your first login
- You will be required to change your password on first login
- Please keep this information secure and do not share it
- If you don't login within 7 days, your account may be deactivated

WHAT'S NEXT?
1. Login using the credentials above
2. Change your temporary password
3. Complete your restaurant profile
4. Set up your menu items
5. Configure your table management
6. Start accepting orders!

If you have any questions or need assistance, please contact our support team.

Best regards,
The Tabtep Team

---
This email was sent to ${data.ownerEmail} because a restaurant account was created for you.
© 2024 Tabtep. All rights reserved.
`;
  }

  /**
   * Send password reset email
   */
  static async sendPasswordResetEmail(
    email: string,
    resetToken: string,
    resetUrl: string
  ): Promise<boolean> {
    const template: EmailTemplate = {
      to: email,
      subject: 'Password Reset - Tabtep',
      htmlContent: `
        <h2>Password Reset Request</h2>
        <p>You requested a password reset for your Tabtep account.</p>
        <p><a href="${resetUrl}">Click here to reset your password</a></p>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this reset, please ignore this email.</p>
      `,
      textContent: `
        Password Reset Request
        
        You requested a password reset for your Tabtep account.
        
        Reset URL: ${resetUrl}
        
        This link will expire in 1 hour.
        
        If you didn't request this reset, please ignore this email.
      `,
    };

    return this.sendEmail(template);
  }
}
