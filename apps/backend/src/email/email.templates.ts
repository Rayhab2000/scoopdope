export const emailTemplates = {
  enrollment: (data: { userName: string; courseTitle: string; courseUrl: string; unsubscribeUrl: string }) => ({
    subject: `You're enrolled in "${data.courseTitle}"`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2>Welcome to ${data.courseTitle}!</h2>
        <p>Hi ${data.userName},</p>
        <p>You've successfully enrolled. Start learning now:</p>
        <a href="${data.courseUrl}" style="background:#4F46E5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Go to Course</a>
        <p style="margin-top:40px;font-size:12px;color:#999">
          <a href="${data.unsubscribeUrl}">Unsubscribe</a>
        </p>
      </div>`,
  }),

  completion: (data: { userName: string; courseTitle: string; credentialUrl: string; unsubscribeUrl: string }) => ({
    subject: `Congratulations! You completed "${data.courseTitle}"`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2>🎉 Course Completed!</h2>
        <p>Hi ${data.userName},</p>
        <p>You've completed <strong>${data.courseTitle}</strong>. Your credential is ready:</p>
        <a href="${data.credentialUrl}" style="background:#059669;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">View Credential</a>
        <p style="margin-top:40px;font-size:12px;color:#999">
          <a href="${data.unsubscribeUrl}">Unsubscribe</a>
        </p>
      </div>`,
  }),

  credentialIssued: (data: { userName: string; courseTitle: string; txHash: string; unsubscribeUrl: string }) => ({
    subject: `Your blockchain credential for "${data.courseTitle}" is ready`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2>🏆 Credential Issued on Stellar</h2>
        <p>Hi ${data.userName},</p>
        <p>Your credential for <strong>${data.courseTitle}</strong> has been recorded on the Stellar blockchain.</p>
        <p>Transaction: <code>${data.txHash}</code></p>
        <p style="margin-top:40px;font-size:12px;color:#999">
          <a href="${data.unsubscribeUrl}">Unsubscribe</a>
        </p>
      </div>`,
  }),

  moduleUnlocked: (data: { userName: string; courseTitle: string; moduleTitle: string; courseUrl: string; unsubscribeUrl: string }) => ({
    subject: `New content unlocked in "${data.courseTitle}"`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2>🔓 New Module Available</h2>
        <p>Hi ${data.userName},</p>
        <p>A new module has just unlocked in <strong>${data.courseTitle}</strong>:</p>
        <p style="font-size:18px;font-weight:bold">${data.moduleTitle}</p>
        <a href="${data.courseUrl}" style="background:#4F46E5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Start Learning</a>
        <p style="margin-top:40px;font-size:12px;color:#999">
          <a href="${data.unsubscribeUrl}">Unsubscribe</a>
        </p>
      </div>`,
  }),

  liveSessionReminder: (data: { userName: string; sessionTitle: string; date: string; timeLabel: string; joinUrl: string; sessionUrl: string }) => ({
    subject: `⏰ Reminder: "${data.sessionTitle}" starts in ${data.timeLabel}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2>⏰ Session starting in ${data.timeLabel}</h2>
        <p>Hi ${data.userName},</p>
        <p><strong>${data.sessionTitle}</strong> starts in ${data.timeLabel}.</p>
        <ul>
          <li><strong>Date:</strong> ${data.date}</li>
          ${data.joinUrl ? `<li><strong>Join:</strong> <a href="${data.joinUrl}">${data.joinUrl}</a></li>` : ''}
        </ul>
        <a href="${data.joinUrl || data.sessionUrl}" style="background:#059669;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Join Now</a>
      </div>`,
  }),

  calendarInvite: (data: { userName: string; sessionTitle: string; date: string; duration: number; joinUrl?: string; sessionUrl: string }) => ({
    subject: `📅 Live Session: ${data.sessionTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2>📅 You're invited to a live session</h2>
        <p>Hi ${data.userName},</p>
        <p><strong>${data.sessionTitle}</strong> has been scheduled.</p>
        <ul>
          <li><strong>Date:</strong> ${data.date}</li>
          <li><strong>Duration:</strong> ${data.duration} minutes</li>
          ${data.joinUrl ? `<li><strong>Join:</strong> <a href="${data.joinUrl}">${data.joinUrl}</a></li>` : ''}
        </ul>
        <p>Add to your calendar using the attached .ics file.</p>
        <a href="${data.sessionUrl}" style="background:#4F46E5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">View Session</a>
      </div>`,
  }),
};
