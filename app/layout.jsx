export const metadata = {
  title: "Noa HUD",
  description: "Halo-style AI assistant",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fi">
      <body>{children}</body>
    </html>
  );
}
