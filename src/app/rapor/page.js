"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function RaporPaneli() {
  const [sonuclar, setSonuclar] = useState({
    vaktinde: 0,
    mufredat: 0,
    toplam: 0,
  });
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    const verileriCek = async () => {
      try {
        // Sadece anketi doldurmuş (null olmayan) öğrencileri çekiyoruz
        const { data, error } = await supabase
          .from("attendance")
          .select("hoca_vaktinde_geldi, konu_islendi")
          .not("hoca_vaktinde_geldi", "is", null);

        if (error) throw error;

        if (data && data.length > 0) {
          const toplamCevap = data.length;
          const vaktindeEvet = data.filter(
            (d) => d.hoca_vaktinde_geldi === true,
          ).length;
          const mufredatEvet = data.filter(
            (d) => d.konu_islendi === true,
          ).length;

          setSonuclar({
            vaktinde: Math.round((vaktindeEvet / toplamCevap) * 100),
            mufredat: Math.round((mufredatEvet / toplamCevap) * 100),
            toplam: toplamCevap,
          });
        }
      } catch (error) {
        console.error("Rapor çekme hatası:", error);
      } finally {
        setYukleniyor(false);
      }
    };

    verileriCek();

    // CANLI GÜNCELLEME: Öğrenciler ankete bastıkça ekran anında güncellenir!
    const radar = supabase
      .channel("rapor-dinleyici")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "attendance" },
        () => {
          verileriCek();
        },
      )
      .subscribe();

    return () => supabase.removeChannel(radar);
  }, []);

  if (yukleniyor) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 font-bold text-[#2A81EA] animate-pulse">
        Raporlar Derleniyor...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-12 flex flex-col items-center justify-center">
      <div className="max-w-4xl w-full">
        {/* Üst Başlık */}
        <div className="text-center mb-10">
          <img
            src="/logo.png"
            alt="KSÜ Logo"
            className="w-24 h-24 mx-auto mb-4"
          />
          <h1 className="text-3xl font-black text-gray-800 tracking-wide uppercase">
            AKDS Canlı Kalite Raporu
          </h1>
          <p className="text-gray-500 font-medium mt-2">
            YÖKAK Standartları Gerçek Zamanlı Denetim Paneli
          </p>
        </div>

        {/* Sonuç Kartları */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div className="bg-white p-8 rounded-2xl shadow-sm border-2 border-blue-100 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-500"></div>
            <h2 className="text-gray-600 font-bold uppercase tracking-wider text-sm mb-4">
              Zaman Yönetimi (Vaktinde Başlama)
            </h2>
            <div className="text-7xl font-black text-blue-600 mb-2">
              %{sonuclar.vaktinde}
            </div>
            <p className="text-xs text-gray-400 font-medium">
              Öğrenci Memnuniyet Oranı
            </p>
          </div>

          <div className="bg-white p-8 rounded-2xl shadow-sm border-2 border-emerald-100 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-emerald-500"></div>
            <h2 className="text-gray-600 font-bold uppercase tracking-wider text-sm mb-4">
              Müfredat Uyumu (Konu İşlendi mi?)
            </h2>
            <div className="text-7xl font-black text-emerald-600 mb-2">
              %{sonuclar.mufredat}
            </div>
            <p className="text-xs text-gray-400 font-medium">
              Öğrenci Memnuniyet Oranı
            </p>
          </div>
        </div>

        {/* Canlı Sayaç Bilgisi */}
        <div className="bg-[#2A81EA] text-white p-4 rounded-xl text-center shadow-md animate-pulse">
          <p className="font-bold tracking-wide">
            <i className="fa-solid fa-circle-dot text-red-400 mr-2"></i>
            Canlı Veri Akışı Aktif • Toplam {sonuclar.toplam} Gerçek Zamanlı
            Geri Bildirim
          </p>
        </div>
      </div>
    </div>
  );
}
