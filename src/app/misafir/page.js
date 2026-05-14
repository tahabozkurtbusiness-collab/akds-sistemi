"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function MisafirGirisi() {
  const router = useRouter();
  const [durum, setDurum] = useState("Sisteme güvenli bağlantı kuruluyor...");

  useEffect(() => {
    const misafirOlustur = async () => {
      try {
        // 1. Rastgele bir İzleyici Numarası Üret
        const rastgeleSayi = Math.floor(Math.random() * 1000000);
        const misafirNo = `M-${rastgeleSayi}`;
        const misafirAd = `Konuk İzleyici ${rastgeleSayi.toString().substring(0, 3)}`;

        setDurum("Geçici oturum kimliği oluşturuluyor...");

        // 2. Veritabanına bu izleyiciyi resmi bir öğrenci gibi kaydet
        const { data: yeniKullanici, error } = await supabase
          .from("users")
          .insert([
            {
              kullanici_no: misafirNo,
              sifre: "demo-sifre", // Önemli değil, bir daha girmeyecekler
              rol: "ogrenci",
              ad_soyad: misafirAd,
            },
          ])
          .select()
          .single();

        if (error) throw error;

        // 3. Kullanıcıyı sisteme giriş yapmış gibi tarayıcıya kaydet
        localStorage.setItem("kullanici", JSON.stringify(yeniKullanici));

        setDurum("Bağlantı başarılı! Katılım paneline yönlendiriliyorsunuz...");

        // 4. Öğrenci paneline (Kodu girme ekranına) ışınla
        setTimeout(() => {
          router.push("/ogrenci");
        }, 1000);
      } catch (error) {
        console.error("Misafir kayıt hatası:", error);
        setDurum("Sistemsel bir hata oluştu. Lütfen sayfayı yenileyin.");
      }
    };

    // Eğer zaten giriş yapmışsa direkt yönlendir, yapmamışsa misafir oluştur
    if (localStorage.getItem("kullanici")) {
      router.push("/ogrenci");
    } else {
      misafirOlustur();
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 md:p-8 text-center">
      <div className="bg-white p-8 md:p-12 rounded shadow-sm border border-gray-200 flex flex-col items-center max-w-lg w-full">
        {/* Resmi KSÜ Logosu */}
        <img
          src="/logo.png"
          alt="KSÜ Logo"
          className="w-24 h-24 object-contain mb-6 drop-shadow-sm"
        />

        {/* Kurumsal Başlıklar */}
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 tracking-wide leading-tight mb-2">
          KAHRAMANMARAŞ
          <br />
          SÜTÇÜ İMAM ÜNİVERSİTESİ
        </h1>
        <p className="text-[#2A81EA] font-bold uppercase tracking-widest text-sm mb-10">
          AKDS - Akademik Kalite Denetim Sistemi
        </p>

        {/* Yükleme Animasyonu (KSÜ Mavisi) */}
        <div className="relative w-16 h-16 mb-6">
          <div className="absolute inset-0 border-4 border-gray-100 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-[#2A81EA] border-t-transparent border-b-transparent rounded-full animate-spin"></div>
        </div>

        {/* Durum Metni */}
        <p className="text-lg text-gray-600 font-medium animate-pulse">
          {durum}
        </p>
      </div>
    </div>
  );
}
