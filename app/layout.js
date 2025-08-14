// app/layout.js
import './globals.css';
import NavBar from '@/components/NavBar';
import Providers from './providers';

export const metadata = {
  title: 'LooksLab',
  description: 'Looks scoring & Face‑Off studio for creators',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-black text-neutral-100">
        <Providers>
          <NavBar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
