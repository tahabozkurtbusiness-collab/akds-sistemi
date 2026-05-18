"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function OgrenciPaneli() {
  const router = useRouter();

  const [sayfaHazir, setSayfaHazir] = useState(false);
  const [ogrenci, setOgrenci] = useState(null);
  const [girilenKod, setGirilenKod] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);
  const [dersteMi, setDersteMi] = useState(false);
  const [aktifOturum, setAktifOturum] = useState(null);
  const [spamKorumasi, setSpamKorumasi] = useState(false);
  const [molaModu, setMolaModu] = useState(false);
  const [dersBitti, setDersBitti] = useState(false);

  useEffect(() => {
    const baslangicKontrolu = async () => {
      const kayitliKullanici = localStorage.getItem("kullanici");
      if (!kayitliKullanici) {
        router.push("/");
        return;
      }

      const kullaniciVerisi = JSON.parse(kayitliKullanici);
      if (kullaniciVerisi.rol !== "ogrenci") {
        router.push("/hoca");
        return;
      }
      setOgrenci(kullaniciVerisi);

      // F5 SPAM KORUMASI (Anlamadım butonu için)
      const sonTiklama = localStorage.getItem("sonAnlamadimZamani");
      if (sonTiklama) {
        const gecenZaman = Date.now() - parseInt(sonTiklama);
        if (gecenZaman < 60000) {
          setSpamKorumasi(true);
          setTimeout(() => {
            setSpamKorumasi(false);
          }, 60000 - gecenZaman);
        }
      }

      // F5 KORUMASI: Öğrenci zaten aktif bir derste mi?
      try {
        const { data: yoklamalar } = await supabase
          .from("attendance")
          .select("oturum_id")
          .eq("ogrenci_id", kullaniciVerisi.id);

        if (yoklamalar && yoklamalar.length > 0) {
          const oturumIdleri = yoklamalar.map((y) => y.oturum_id);

          const { data: aktifOturumData } = await supabase
            .from("sessions")
            .select("*")
            .in("id", oturumIdleri)
            .in("durum", ["aktif", "uyku_modu", "bitti"])
            .order("id", { ascending: false })
            .limit(1);

          if (aktifOturumData && aktifOturumData.length > 0) {
            const bulunanOturum = aktifOturumData[0];

            if (bulunanOturum.durum !== "bitti") {
              setAktifOturum(bulunanOturum);
              setDersteMi(true);
              if (bulunanOturum.durum === "uyku_modu") setMolaModu(true);
            } else {
              setAktifOturum(bulunanOturum);
              setDersteMi(true);
              setDersBitti(true);
            }
          }
        }
      } catch (error) {
        console.error("Öğrenci oturum kurtarma hatası:", error);
      } finally {
        setSayfaHazir(true);
      }
    };

    baslangicKontrolu();
  }, [router]);

  // Anlık Sınıf Senkronizasyonu (Mola ve Ders Bitişi Dinleyicisi)
  useEffect(() => {
    if (!aktifOturum) return;

    const oturumKanal = supabase
      .channel(`ogrenci-dinleyici-${aktifOturum.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `id=eq.${aktifOturum.id}`,
        },
        (payload) => {
          if (payload.new.mola_modu !== undefined) {
            setMolaModu(payload.new.mola_modu);
          }
          if (payload.new.durum === "bitti") {
            setDersBitti(true);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(oturumKanal);
    };
  }, [aktifOturum, ogrenci]);

  const yoklamayaKatil = async () => {
    if (yukleniyor) return; // ÇİFTE ZIRH: Eğer saniyede 10 kere basılırsa diğerlerini engelle
    if (girilenKod.length !== 4) {
      alert("Lütfen 4 haneli kodu girin!");
      return;
    }
    setYukleniyor(true);

    try {
      const { data: oturumData, error: oturumHata } = await supabase
        .from("sessions")
        .select("*")
        .eq("katilim_kodu", girilenKod)
        .eq("durum", "aktif")
        .single();

      if (oturumHata || !oturumData) {
        alert("Geçersiz veya süresi dolmuş bir kod girdiniz!");
        setYukleniyor(false);
        return;
      }

      const { data: varMi } = await supabase
        .from("attendance")
        .select("*")
        .eq("oturum_id", oturumData.id)
        .eq("ogrenci_id", ogrenci.id)
        .single();

      if (varMi) {
        setAktifOturum(oturumData);
        setDersteMi(true);
        setYukleniyor(false);
        return;
      }

      // Veritabanına kaydederken doğrudan anket onaylı (true) gibi kaydediyoruz
      const { error: kayitHata } = await supabase.from("attendance").insert([
        {
          oturum_id: oturumData.id,
          ogrenci_id: ogrenci.id,
          yoklama_gecerli_mi: true,
        },
      ]);

      if (kayitHata) throw kayitHata;

      setAktifOturum(oturumData);
      setDersteMi(true);
    } catch (error) {
      alert("Sistemsel bir hata oluştu: " + error.message);
    } finally {
      setYukleniyor(false);
    }
  };

  // Konu Tekrarı Talep Et (Eşzamanlılık Korumalı - RPC)
  const anlamadimBildir = async () => {
    if (spamKorumasi || !aktifOturum) return;

    setSpamKorumasi(true);
    localStorage.setItem("sonAnlamadimZamani", Date.now().toString());

    try {
      const { error } = await supabase.rpc("increment_anlamadim", {
        p_oturum_id: aktifOturum.id,
      });

      if (error) throw error;

      alert("Bildiriminiz hocaya isimsiz olarak iletildi!");

      setTimeout(() => {
        setSpamKorumasi(false);
      }, 60000);
    } catch (error) {
      console.error("RPC Hatası:", error);
      alert("Bildirim gönderilemedi.");
      setSpamKorumasi(false);
    }
  };

  if (!ogrenci || !sayfaHazir) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-xl font-bold text-[#2A81EA] animate-pulse">
          Öğrenci Paneli Yükleniyor...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <header className="flex flex-col md:flex-row justify-between items-center bg-white p-4 md:p-6 shadow-sm mb-8 border-b border-gray-200 rounded">
        <div className="flex items-center gap-4 mb-4 md:mb-0">
          <img
            src="/logo.png"
            alt="KSÜ Logo"
            className="w-16 h-16 md:w-20 md:h-20 object-contain"
          />
          <div className="flex flex-col border-l-2 border-gray-300 pl-4">
            <span className="text-[1.1rem] md:text-xl font-bold text-gray-800 tracking-wide leading-tight">
              KAHRAMANMARAŞ
            </span>
            <span className="text-[1.1rem] md:text-xl font-bold text-gray-800 tracking-wide leading-tight">
              SÜTÇÜ İMAM ÜNİVERSİTESİ
            </span>
            <span className="text-[0.75rem] md:text-xs font-black text-[#2A81EA] uppercase tracking-widest mt-1">
              AKDS - Akademik Kalite Denetim Sistemi
            </span>
          </div>
        </div>
        <button
          onClick={() => {
            localStorage.removeItem("kullanici");
            router.push("/");
          }}
          className="px-6 py-2.5 bg-[#2A81EA] text-white rounded font-bold hover:bg-blue-600 transition-colors shadow-sm"
        >
          Sistemden Çıkış
        </button>
      </header>

      <main className="max-w-md mx-auto">
        {!dersteMi ? (
          <div className="bg-white p-8 rounded shadow-sm border border-gray-200 text-center">
            <div className="w-16 h-16 bg-[#f0f6ff] rounded flex items-center justify-center mx-auto mb-4 border border-[#e0edff]">
              <svg
                className="w-8 h-8 text-[#2A81EA]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.092 2.027-.273 3.013m-2.24 2.241A13.94 13.94 0 0112 21c-3.866 0-7.33-1.55-9.865-4.062M12 21c2.81 0 5.428-1.083 7.42-2.887"
                ></path>
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">
              Öğrenci Katılım Paneli
            </h2>
            <p className="text-gray-500 mb-6 text-sm">
              Öğretim görevlisinin paylaştığı 4 haneli oturum kodunu giriniz.
            </p>
            <input
              type="text"
              maxLength={4}
              placeholder="0000"
              value={girilenKod}
              onChange={(e) =>
                setGirilenKod(e.target.value.replace(/[^0-9]/g, ""))
              }
              className="w-full px-5 py-4 rounded border border-gray-300 focus:ring-2 focus:ring-[#2A81EA] outline-none transition-all mb-4 text-center text-3xl tracking-[1em] font-bold text-gray-700 bg-gray-50"
            />
            <button
              onClick={yoklamayaKatil}
              disabled={yukleniyor || girilenKod.length !== 4}
              className="w-full bg-[#2A81EA] hover:bg-[#1e6bcc] text-white font-bold py-3.5 rounded shadow transition-all disabled:bg-gray-400"
            >
              {yukleniyor ? "Sistem Sorgulanıyor..." : "Derse Katıl"}
            </button>
          </div>
        ) : dersBitti ? (
          <div className="bg-white p-8 rounded shadow-sm border border-gray-200 text-center transition-all duration-500 animate-fade-in">
            <div className="w-20 h-20 bg-green-50 rounded flex items-center justify-center mx-auto mb-4 border border-green-100">
              <svg
                className="w-10 h-10 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M5 13l4 4L19 7"
                ></path>
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">
              Oturum Sona Erdi
            </h2>
            <p className="text-gray-600 text-sm">
              Katılımınız başarıyla sisteme işlenmiş ve onaylanmıştır.
              Çıkabilirsiniz, iyi günler dileriz.
            </p>
          </div>
        ) : molaModu ? (
          <div className="bg-white p-8 rounded shadow-sm border border-yellow-200 text-center transition-all duration-500">
            <div className="w-16 h-16 bg-yellow-50 rounded flex items-center justify-center mx-auto mb-4 border border-yellow-100 animate-pulse">
              <svg
                className="w-8 h-8 text-yellow-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                ></path>
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">
              Oturum Duraklatıldı
            </h2>
            <p className="text-gray-500 text-sm">
              Öğretim görevlisi derse ara vermiştir. Oturum tekrar
              başlatıldığında ekranınız otomatik olarak güncellenecektir.
            </p>
          </div>
        ) : (
          <div className="bg-white p-8 rounded shadow-sm border border-green-200 text-center transition-all duration-500">
            <div className="w-16 h-16 bg-green-50 rounded flex items-center justify-center mx-auto mb-4 border border-green-100">
              <svg
                className="w-8 h-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M5 13l4 4L19 7"
                ></path>
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">
              Katılımınız Sisteme İşlenmiştir
            </h2>
            <p className="text-[#2A81EA] font-bold uppercase tracking-wider text-sm mb-6">
              {aktifOturum?.ders_adi}
            </p>
            <div className="pt-6 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-4 font-medium">
                Ders esnasında anlaşılmayan bir konu olursa aşağıdaki butonu
                kullanarak anonim bildirim gönderebilirsiniz.
              </p>
              <button
                onClick={anlamadimBildir}
                disabled={spamKorumasi}
                className={`w-full text-white font-bold py-3.5 rounded shadow transition-all ${spamKorumasi ? "bg-gray-400 cursor-not-allowed" : "bg-orange-500 hover:bg-orange-600"}`}
              >
                {spamKorumasi
                  ? "Bildirim İletildi (60sn Bekleyin)"
                  : "Konu Tekrarı Talep Et"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
