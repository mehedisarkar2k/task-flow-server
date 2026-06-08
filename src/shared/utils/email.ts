export const sendEmail = async (to: string, subject: string, body: string): Promise<void> => {
  // Dummy function for now
  console.log(`\n[EMAIL] Sending email to: ${to}`);
  console.log(`[EMAIL] Subject: ${subject}`);
  console.log(`[EMAIL] Body:\n${body}\n`);
};
