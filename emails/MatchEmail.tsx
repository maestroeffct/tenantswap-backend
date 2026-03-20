// emails/NotificationEmail.tsx
import React from 'react'
import {
      Body, Button, Container, Head, Heading,
      Hr, Html, Img, Preview, Section, Text,
      Tailwind, Link, Font,
} from '@react-email/components'

interface MatchEmailProps {
      title: string
      message: string
      actionLabel?: string
      actionUrl?: string
      footerNote?: string
      previewText?: string
      appUrl: string
      supportEmail: string
      companyName: string
}
const fallbackUrl = `http://localhost:3000`


export const MatchEmail = ({
      title = 'Reset Your Password',
      message = 'We received a request to reset your password. Click the button below to choose a new one.',
      actionLabel = 'Reset Password',
      actionUrl = `${fallbackUrl}/reset-password?token=uJjfnok-9-0-0`,
      footerNote = 'If you did not request a password reset, you can safely ignore this email.',
      previewText = 'Reset your TenantSwap password',
      appUrl = fallbackUrl,
      supportEmail,
      companyName
}: MatchEmailProps) => {
      return (
            <Html lang="en">
                  <Head>
                        <Font fontFamily="Poppins" fallbackFontFamily="Arial"
                              webFont={{ url: 'https://fonts.gstatic.com/s/poppins/v21/pxiEyp8kv8JHgFVrJJfecg.woff2', format: 'woff2' }}
                              fontWeight={400} fontStyle="normal" />
                        <Font fontFamily="Poppins" fallbackFontFamily="Arial"
                              webFont={{ url: 'https://fonts.gstatic.com/s/poppins/v21/pxiByp8kv8JHgFVrLGT9Z1xlFQ.woff2', format: 'woff2' }}
                              fontWeight={600} fontStyle="normal" />
                        <Font fontFamily="Poppins" fallbackFontFamily="Arial"
                              webFont={{ url: 'https://fonts.gstatic.com/s/poppins/v21/pxiByp8kv8JHgFVrLCz7Z1xlFQ.woff2', format: 'woff2' }}
                              fontWeight={700} fontStyle="normal" />
                  </Head>

                  <Preview>{previewText ?? title}</Preview>

                  <Tailwind>
                        <Body className="bg-slate-50 m-0 p-0" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>
                              <Container className="mx-auto py-10 px-4 max-w-xl">

                                    {/* Card */}
                                    <Section className="bg-white rounded-2xl border border-slate-200 px-10 py-10">

                                          {/* Logo */}
                                          <Section className="text-center mb-6">
                                                <Img
                                                      src={`${appUrl}/favicon.ico`}
                                                      alt={companyName}
                                                      width={56}
                                                      height={56}
                                                      className="mx-auto"
                                                />
                                                <Text style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '8px 0 0', textAlign: 'center' }}>
                                                      {companyName}
                                                </Text>
                                          </Section>

                                          {/* Title */}
                                          <Heading style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', textAlign: 'center', margin: '0 0 10px', lineHeight: 1.3 }}>
                                                {title}
                                          </Heading>

                                          {/* Accent bar */}
                                          <div style={{ width: 40, height: 3, backgroundColor: '#059669', borderRadius: 99, margin: '0 auto 20px' }} />

                                          {/* Message */}
                                          <Text style={{ fontSize: 15, color: '#475569', textAlign: 'center', lineHeight: 1.7, margin: '0 0 8px' }}>
                                                {message}
                                          </Text>

                                          {/* CTA */}
                                          {actionLabel && actionUrl && (
                                                <>
                                                      <Section className="text-center my-7">
                                                            <Button
                                                                  href={actionUrl}
                                                                  style={{
                                                                        backgroundColor: '#059669',
                                                                        color: '#ffffff',
                                                                        borderRadius: 12,
                                                                        fontSize: 15,
                                                                        fontWeight: 700,
                                                                        padding: '14px 36px',
                                                                        textDecoration: 'none',
                                                                        display: 'inline-block',
                                                                        letterSpacing: '0.3px',
                                                                  }}
                                                            >
                                                                  {actionLabel}
                                                            </Button>
                                                      </Section>

                                                      <Text style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', margin: '0 0 20px' }}>
                                                            Button not working? Copy and paste this link into your browser:
                                                            <br />
                                                            <Link href={actionUrl} style={{ color: '#059669', wordBreak: 'break-all' }}>
                                                                  {actionUrl}
                                                            </Link>
                                                      </Text>
                                                </>
                                          )}

                                          <Hr style={{ borderColor: '#f1f5f9', margin: '24px 0 20px' }} />

                                          {/* Help */}
                                          <Text style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', margin: 0 }}>
                                                Need help? Contact us at{' '}
                                                <Link href={`mailto:${supportEmail}`} style={{ color: '#059669' }}>
                                                      {supportEmail}
                                                </Link>
                                          </Text>

                                    </Section>

                                    {/* Footer */}
                                    <Section className="text-center mt-6">
                                          {footerNote && (
                                                <Text style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 4px' }}>
                                                      {footerNote}
                                                </Text>
                                          )}
                                          <Text style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 4px' }}>
                                                © {new Date().getFullYear()} {companyName}. All rights reserved.
                                          </Text>
                                          <Text style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                                                You're receiving this because you have an account with us.
                                          </Text>
                                    </Section>

                              </Container>
                        </Body>
                  </Tailwind>
            </Html>
      )
}

export default MatchEmail