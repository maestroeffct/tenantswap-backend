import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
  Tailwind,
} from '@react-email/components'

interface VerifyEmailProps {
  fullName: string
  verificationUrl: string
  expiresInMinutes?: number
  appUrl: string
}



// const darkModeStyles = `
//   @media (prefers-color-scheme: dark) {
//     .email-body { background-color: #0f172a !important; }
//     .email-card { background-color: #1e293b !important; border-color: #334155 !important; }
//     .email-heading { color: #f1f5f9 !important; }
//     .email-text { color: #94a3b8 !important; }
//     .email-text-muted { color: #64748b !important; }
//     .email-fallback-note { color: #64748b !important; }
//     .email-fallback-url { color: #34d399 !important; }
//     .email-expiry-box { background-color: #0f2b1f !important; border-left-color: #34d399 !important; }
//     .email-expiry-text { color: #94a3b8 !important; }
//     .email-expiry-strong { color: #e2e8f0 !important; }
//     .email-hr { border-color: #1e293b !important; }
//     .email-footer { color: #475569 !important; }
//     .email-button {
//       background-color: #34d399 !important;
//       color: #022c22 !important;
//     }
//   }
// `

export const VerifyEmail = ({
  fullName = 'John Doe',
  verificationUrl = 'https://example.com',
  appUrl = 'http://localhost:3000',
}: VerifyEmailProps) => {

  return (
    <Html lang="en">
      <Head>
        {/* <style>{darkModeStyles}</style> */}
      </Head>
      <Preview>Verify your TenantSwap email address</Preview>
      <Tailwind>
        <Body className="email-body bg-gray-50 font-sans">
          <Container className="mx-auto py-12 px-4 max-w-xl">

            {/* Card */}
            <Section
              className="email-card bg-white rounded-2xl px-10 py-10 shadow-sm border border-gray-100"
            >

              {/* Logo */}
              <Section className="text-center mb-6">
                <div
                  style={{
                    width: 64,
                    height: 64,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto',
                  }}
                >
                  <Img
                    src={`${appUrl}/favicon.ico`}
                    alt="TenantSwap"
                    width={70}
                    height="auto"
                    className="mx-auto"
                  />
                </div>
              </Section>

              <Heading className="email-heading text-2xl font-bold text-gray-900 text-center mt-0 mb-2">
                Verify your email
              </Heading>

              <Text className="email-text text-gray-500 text-sm text-center mt-0 mb-8">
                Hi {fullName}, welcome to TenantSwap! Please verify your email
                address to activate your account and start finding your perfect swap.
              </Text>

              {/* CTA */}
              <Section className="text-center mb-8">
                <Button
                  href={verificationUrl}
                  className="email-button"
                  style={{
                    backgroundColor: '#059669',
                    color: '#ffffff',
                    borderRadius: 12,
                    fontSize: 15,
                    fontWeight: 700,
                    padding: '14px 32px',
                    textDecoration: 'none',
                    display: 'inline-block',
                  }}
                >
                  Verify Email Address
                </Button>
              </Section>

              {/* Expiry note */}
              <Section
                className="email-expiry-box"
                style={{
                  backgroundColor: '#f8fafc',
                  borderRadius: 12,
                  padding: '12px 16px',
                  marginBottom: 24,
                  borderLeft: '4px solid #059669',
                }}
              >
                <Text className="email-expiry-text text-xs text-gray-500 m-0">
                  If you didn't create a TenantSwap account, you can safely ignore this email.
                </Text>
              </Section>

              {/* Manual URL fallback */}
              <Text className="email-fallback-note text-xs text-gray-400 text-center m-0">
                Button not working? Copy and paste this link into your browser:
              </Text>
              <Text
                className="email-fallback-url"
                style={{
                  fontSize: 11,
                  color: '#059669',
                  wordBreak: 'break-all',
                  textAlign: 'center',
                  margin: '6px 0 0',
                }}
              >
                {verificationUrl}
              </Text>
            </Section>

            <Hr
              className="email-hr"
              style={{
                borderColor: '#e2e8f0',
                margin: '32px 0',
              }}
            />

            {/* Footer */}
            <Text className="email-footer text-xs text-gray-400 text-center m-0">
              © {new Date().getFullYear()} TenantSwap. All rights reserved.
            </Text>
            <Text className="email-footer text-xs text-gray-400 text-center mt-1">
              You're receiving this because you created a TenantSwap account.
            </Text>

          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}

export default VerifyEmail