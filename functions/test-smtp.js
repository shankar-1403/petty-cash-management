// Run: node test-smtp.js <email> <password> <to>
// Example: node test-smtp.js info@pcred.in "Office@1234" parvez@drivtech.in
const nodemailer = require('nodemailer')

const [,, user, pass, to] = process.argv
if (!user || !pass || !to) {
  console.error('Usage: node test-smtp.js <email> <password> <to>')
  process.exit(1)
}

const transporter = nodemailer.createTransport({
  host: 'smtp.office365.com',
  port: 587,
  secure: false,
  auth: { user, pass },
})

transporter.verify()
  .then(() => {
    console.log('✓ SMTP connection verified — credentials are valid!')
    return transporter.sendMail({
      from: `"Test" <${user}>`,
      to,
      subject: 'SMTP Test',
      text: 'This is a test email from the SMTP test script.',
    })
  })
  .then(info => console.log('✓ Test email sent:', info.messageId))
  .catch(err => {
    console.error('✗ Failed:', err.message)
    console.error('Code:', err.code, '| Response:', err.response)
  })
