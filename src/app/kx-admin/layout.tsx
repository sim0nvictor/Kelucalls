import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kelucalls Internal Studio",
  robots: {
    index: false,
    follow: false
  }
};

export default function KxAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.12),transparent_22%),linear-gradient(180deg,#020817_0%,#07111f_100%)]">
      {children}
    </div>
  );
}


