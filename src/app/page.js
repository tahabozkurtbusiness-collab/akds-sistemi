"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();
  const [kullaniciNo, setKullaniciNo] = useState("");
  const [sifre, setSifre] = useState("");
  const [hataMesaji, setHataMesaji] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);

  const girisYap = async (e) => {
    e.preventDefault();
    setHataMesaji("");
    setYukleniyor(true);

    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("kullanici_no", kullaniciNo)
        .eq("sifre", sifre)
        .single();

      if (error || !data) {
        setHataMesaji(
          "Sistem Kaydı Bulunamadı: Kurum Sicil veya Parola hatalı.",
        );
        setYukleniyor(false);
        return;
      }

      // Giriş başarılıysa: Bilgileri tarayıcının hafızasına kaydet
      localStorage.setItem(
        "kullanici",
        JSON.stringify({
          id: data.id,
          ad_soyad: data.ad_soyad,
          rol: data.rol,
        }),
      );

      // Rolüne göre ilgili sayfaya yönlendir
      if (data.rol === "hoca") {
        router.push("/hoca");
      } else if (data.rol === "ogrenci") {
        router.push("/ogrenci");
      }
    } catch (err) {
      setHataMesaji("Sistemsel bir hata oluştu. Lütfen tekrar deneyiniz.");
    } finally {
      setYukleniyor(false);
    }
  };

  return (
    <div
      className="relative min-h-screen flex items-center justify-center bg-cover bg-center p-4"
      style={{ backgroundImage: "url('/giris.jpg')" }}
    >
      {/* Arka Plan Karartma ve Bulanıklık (Manzarayı Daha Şık Gösterir) */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>

      {/* Kurumsal OBS Tarzı Giriş Kutusu */}
      <div className="relative z-10 w-full max-w-md bg-white rounded shadow-2xl border border-gray-100 p-8 md:p-10 overflow-hidden">
        {/* Üst Mavi Çizgi Vurgusu */}
        <div className="absolute top-0 left-0 w-full h-1.5 bg-[#2A81EA]"></div>

        <div className="flex flex-col items-center mb-8 text-center">
          <img
            src="/logo.png"
            alt="KSÜ Logo"
            className="w-24 h-24 object-contain mb-5 drop-shadow-sm"
          />
          <h1 className="text-xl font-bold text-gray-800 leading-tight">
            KAHRAMANMARAŞ <br /> SÜTÇÜ İMAM ÜNİVERSİTESİ
          </h1>
          <h2 className="text-[0.8rem] font-bold text-[#2A81EA] mt-2 uppercase tracking-widest">
            AKDS - Akademik Kalite Denetim Sistemi
          </h2>
        </div>

        <form className="space-y-5" onSubmit={girisYap}>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              Kurum Sicil / Öğrenci No
            </label>
            <input
              type="text"
              placeholder="Örn: 1001 veya 220011"
              value={kullaniciNo}
              onChange={(e) => setKullaniciNo(e.target.value)}
              required
              className="w-full px-4 py-3 rounded border border-gray-300 focus:ring-2 focus:ring-[#2A81EA] outline-none transition-all text-gray-800 bg-gray-50"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              Sistem Parolası
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={sifre}
              onChange={(e) => setSifre(e.target.value)}
              required
              className="w-full px-4 py-3 rounded border border-gray-300 focus:ring-2 focus:ring-[#2A81EA] outline-none transition-all text-gray-800 bg-gray-50"
            />
          </div>

          {hataMesaji && (
            <div className="text-red-700 text-sm font-semibold text-center bg-red-50 py-3 rounded border border-red-100">
              {hataMesaji}
            </div>
          )}

          <button
            type="submit"
            disabled={yukleniyor}
            className={`w-full text-white font-bold py-3.5 rounded transition-all shadow-sm mt-2 ${yukleniyor ? "bg-gray-400 cursor-not-allowed" : "bg-[#2A81EA] hover:bg-[#1e6bcc]"}`}
          >
            {yukleniyor ? "Sisteme Bağlanılıyor..." : "Sisteme Giriş Yap"}
          </button>
        </form>

        {/* CANLI DEMO - MİSAFİR GİRİŞİ BUTONU (QR Kod İçin Hayati Önlem) */}
        <div className="mt-8 pt-6 border-t border-gray-100">
          <p className="text-xs text-gray-500 font-medium text-center mb-3">
            Sunum testine katılmak için tıklayın
          </p>
          <button
            type="button"
            onClick={() => router.push("/misafir")}
            className="w-full bg-gray-50 hover:bg-gray-100 text-gray-700 font-bold py-3 rounded border border-gray-200 transition-all flex items-center justify-center gap-2 text-sm"
          >
            <svg
              className="w-5 h-5 text-[#2A81EA]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0z"
              ></path>
            </svg>
            Salondaki İzleyiciyim (Hızlı Katıl)
          </button>
        </div>

        <div className="mt-8 text-center text-[10px] text-gray-400 font-semibold tracking-wider">
          <p>© 2026 KSÜ BİLGİ İŞLEM DAİRE BAŞKANLIĞI</p>
        </div>
      </div>
    </div>
  );
}
