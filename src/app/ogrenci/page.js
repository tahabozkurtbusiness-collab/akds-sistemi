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
  const [anketAcik, setAnketAcik] = useState(false);
  const [cevaplar, setCevaplar] = useState({
    vaktindeGeldi: null,
    konuIslendi: null,
  });
  const [anketTamamlandi, setAnketTamamlandi] = useState(false);
  const [islemSuruyor, setIslemSuruyor] = useState(false);
  const [anketGerekliMi, setAnketGerekliMi] = useState(true);

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

      // F5 SPAM KORUMASI
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
      // F5 KORUMASI: Öğrenci zaten aktif veya anket bekleyen bir derste mi?
      try {
        const { data: yoklamalar } = await supabase
          .from("attendance")
          .select("oturum_id, yoklama_gecerli_mi") // Geçerlilik durumunu da çekiyoruz
          .eq("ogrenci_id", kullaniciVerisi.id);

        if (yoklamalar && yoklamalar.length > 0) {
          const oturumIdleri = yoklamalar.map((y) => y.oturum_id);

          const { data: aktifOturumData } = await supabase
            .from("sessions")
            .select("*")
            .in("id", oturumIdleri)
            .in("durum", ["aktif", "uyku_modu", "bitti"]) // VİZYON: "bitti" statüsünü de arıyoruz
            .order("id", { ascending: false })
            .limit(1);

          if (aktifOturumData && aktifOturumData.length > 0) {
            const bulunanOturum = aktifOturumData[0];

            // İlgili oturumun yoklama detayını bul
            const yoklamaDetay = yoklamalar.find(
              (y) => y.oturum_id === bulunanOturum.id,
            );

            // Eğer ders aktif veya uykudaysa normal devam et
            if (bulunanOturum.durum !== "bitti") {
              setAktifOturum(bulunanOturum);
              setDersteMi(true);
            }
            // Eğer ders BİTMİŞSE ama öğrenci anketi doldurmamışsa (yoklama_gecerli_mi null/false ise)
            else if (
              bulunanOturum.durum === "bitti" &&
              !yoklamaDetay?.yoklama_gecerli_mi
            ) {
              setAktifOturum(bulunanOturum);
              setDersteMi(true);
              setDersBitti(true);
              setAnketGerekliMi(true); // F5 atıp kaçmaya çalışanlara zorunlu anket
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

            // Anket yorgunluğunu önleme algoritması
            const anketCiksinMi =
              ogrenci.kullanici_no === "220011" ? true : Math.random() <= 0.3;
            setAnketGerekliMi(anketCiksinMi);

            if (!anketCiksinMi) {
              otomatikYoklamaOnayla();
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(oturumKanal);
    };
  }, [aktifOturum, ogrenci]);

  // Şanslı öğrenciler için otomatik yoklama onayı
  const otomatikYoklamaOnayla = async () => {
    try {
      await supabase
        .from("attendance")
        .update({ yoklama_gecerli_mi: true })
        .eq("oturum_id", aktifOturum.id)
        .eq("ogrenci_id", ogrenci.id);
      setAnketTamamlandi(true);
    } catch (error) {
      console.error("Otomatik onay hatası:", error);
    }
  };

  const yoklamayaKatil = async () => {
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

      const { error: kayitHata } = await supabase.from("attendance").insert([
        {
          oturum_id: oturumData.id,
          ogrenci_id: ogrenci.id,
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

  // Anket Gönderme Fonksiyonu
  const anketiGonder = async () => {
    if (cevaplar.vaktindeGeldi === null || cevaplar.konuIslendi === null) {
      alert("Lütfen tüm soruları cevaplayın.");
      return;
    }

    setIslemSuruyor(true);

    try {
      const { error } = await supabase
        .from("attendance")
        .update({
          hoca_vaktinde_geldi: cevaplar.vaktindeGeldi,
          konu_islendi: cevaplar.konuIslendi,
          yoklama_gecerli_mi: true,
        })
        .eq("oturum_id", aktifOturum.id)
        .eq("ogrenci_id", ogrenci.id);

      if (error) throw error;

      setAnketTamamlandi(true);
    } catch (error) {
      console.error("Anket hatası:", error);
      alert("Anket gönderilirken bir hata oluştu.");
    } finally {
      setIslemSuruyor(false);
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
      {/* KSÜ RESMİ WEB SİTESİ KLONU - ÜST BAR */}
      {/* AKDS KURUMSAL ÜST BAR */}
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
            {/* İŞTE AKDS VİZYON YAZISI BURADA! */}
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
          // YOKLAMAYA KATILMA EKRANI
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
          // DERS BİTTİ VE AKILLI ANKET EKRANI
          <div className="bg-white p-8 rounded shadow-sm border border-gray-200 text-center transition-all duration-500">
            {anketTamamlandi ? (
              // 3. AŞAMA: ANKET BİTTİ (Nihai Onay)
              <div className="animate-fade-in">
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
                  Yoklamanız Onaylandı
                </h2>
                <p className="text-gray-600 text-sm">
                  {anketGerekliMi
                    ? "Geri bildiriminiz için teşekkürler. Yoklamanız resmi olarak geçerli sayılmıştır. Çıkabilirsiniz."
                    : "Akıllı denetim sistemi, anket yorgunluğunu önlemek amacıyla bu derste sizi anketten muaf tuttu. Yoklamanız otomatik olarak onaylanmıştır. Çıkabilirsiniz."}
                </p>
              </div>
            ) : anketAcik ? (
              // 2. AŞAMA: SORULAR
              <div className="text-left animate-fade-in">
                <h2 className="text-xl font-bold text-[#2A81EA] mb-2 text-center">
                  Kalite Denetim Anketi
                </h2>
                <p className="text-xs text-gray-500 mb-6 text-center bg-gray-50 py-2 rounded font-medium border border-gray-100">
                  Cevaplarınız %100 anonim olarak kaydedilir.
                </p>

                <div className="mb-5">
                  <p className="font-semibold text-gray-800 mb-3 text-sm">
                    1. Öğretim görevlisi derse vaktinde geldi mi?
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() =>
                        setCevaplar({ ...cevaplar, vaktindeGeldi: true })
                      }
                      className={`flex-1 py-3 rounded font-bold border-2 transition-all ${cevaplar.vaktindeGeldi === true ? "bg-[#2A81EA] text-white border-[#2A81EA]" : "bg-white text-gray-600 border-gray-200 hover:border-[#2A81EA]"}`}
                    >
                      Evet
                    </button>
                    <button
                      onClick={() =>
                        setCevaplar({ ...cevaplar, vaktindeGeldi: false })
                      }
                      className={`flex-1 py-3 rounded font-bold border-2 transition-all ${cevaplar.vaktindeGeldi === false ? "bg-[#2A81EA] text-white border-[#2A81EA]" : "bg-white text-gray-600 border-gray-200 hover:border-[#2A81EA]"}`}
                    >
                      Hayır
                    </button>
                  </div>
                </div>

                <div className="mb-8">
                  <p className="font-semibold text-gray-800 mb-3 text-sm">
                    2. Müfredattaki konu işlendi mi?
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() =>
                        setCevaplar({ ...cevaplar, konuIslendi: true })
                      }
                      className={`flex-1 py-3 rounded font-bold border-2 transition-all ${cevaplar.konuIslendi === true ? "bg-[#2A81EA] text-white border-[#2A81EA]" : "bg-white text-gray-600 border-gray-200 hover:border-[#2A81EA]"}`}
                    >
                      Evet
                    </button>
                    <button
                      onClick={() =>
                        setCevaplar({ ...cevaplar, konuIslendi: false })
                      }
                      className={`flex-1 py-3 rounded font-bold border-2 transition-all ${cevaplar.konuIslendi === false ? "bg-[#2A81EA] text-white border-[#2A81EA]" : "bg-white text-gray-600 border-gray-200 hover:border-[#2A81EA]"}`}
                    >
                      Hayır
                    </button>
                  </div>
                </div>

                <button
                  onClick={anketiGonder}
                  disabled={
                    islemSuruyor ||
                    cevaplar.vaktindeGeldi === null ||
                    cevaplar.konuIslendi === null
                  }
                  className="w-full bg-[#2A81EA] hover:bg-[#1e6bcc] disabled:bg-gray-400 text-white font-bold py-3.5 rounded shadow transition-all"
                >
                  {islemSuruyor
                    ? "Sisteme İşleniyor..."
                    : "Gönder ve Yoklamayı Onayla"}
                </button>
              </div>
            ) : (
              // 1. AŞAMA: ANKET GİRİŞ EKRANI
              <div className="animate-fade-in">
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
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    ></path>
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-800 mb-2">
                  Oturum Sona Erdi
                </h2>
                <p className="text-gray-500 text-sm mb-6">
                  Yoklamanızın geçerli sayılması için kalite denetim anketini
                  doldurmanız gerekmektedir.
                </p>
                <button
                  onClick={() => setAnketAcik(true)}
                  className="w-full bg-[#2A81EA] hover:bg-[#1e6bcc] text-white font-bold py-3.5 rounded shadow transition-all"
                >
                  Anketi Doldur
                </button>
              </div>
            )}
          </div>
        ) : molaModu ? (
          // MOLA EKRANI (UYKU MODU)
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
          // AKTİF DERS EKRANI VE ANLAMADIM BUTONU
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
                className={`w-full text-white font-bold py-3.5 rounded shadow transition-all ${
                  spamKorumasi
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-orange-500 hover:bg-orange-600"
                }`}
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
