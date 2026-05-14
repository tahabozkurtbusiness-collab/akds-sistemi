"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function HocaPaneli() {
  const router = useRouter();

  // ==========================================
  // 1. STATE (DURUM) DEĞİŞKENLERİ
  // ==========================================
  const [sayfaHazir, setSayfaHazir] = useState(false);
  const [hoca, setHoca] = useState(null);

  const [siniflar, setSiniflar] = useState([]);
  const [dersler, setDersler] = useState([]);
  const [ogrenciListesi, setOgrenciListesi] = useState([]);

  const [secilenSinif, setSecilenSinif] = useState("");
  const [secilenDers, setSecilenDers] = useState("");
  const [secilenOgrenciId, setSecilenOgrenciId] = useState("");
  const [disiplinNotu, setDisiplinNotu] = useState("");
  const [dersAdi, setDersAdi] = useState("");

  const [kod, setKod] = useState(null);
  const [sayac, setSayac] = useState(0);
  const [oturumId, setOturumId] = useState(null);
  const [oturumDurumu, setOturumDurumu] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(false);

  const [anlamayanSayisi, setAnlamayanSayisi] = useState(0);
  const [katilimciSayisi, setKatilimciSayisi] = useState(0); // Canlı Katılımcı Sayacı

  // ==========================================
  // 2. SİSTEM DİNLEYİCİLERİ (USE-EFFECT)
  // ==========================================

  useEffect(() => {
    const kayitliKullanici = localStorage.getItem("kullanici");
    if (!kayitliKullanici) return router.push("/");

    const kullaniciVerisi = JSON.parse(kayitliKullanici);
    if (kullaniciVerisi.rol !== "hoca") return router.push("/ogrenci");
    setHoca(kullaniciVerisi);

    const verileriGetir = async () => {
      try {
        const { data: odaData } = await supabase.from("rooms").select("*");
        const { data: dersData } = await supabase.from("courses").select("*");
        const { data: ogrenciData } = await supabase
          .from("users")
          .select("*")
          .eq("rol", "ogrenci");

        if (odaData) setSiniflar(odaData);
        if (dersData) setDersler(dersData);
        if (ogrenciData) setOgrenciListesi(ogrenciData);

        const { data: aktifOturumlar, error: oturumHata } = await supabase
          .from("sessions")
          .select("*")
          .eq("hoca_id", kullaniciVerisi.id)
          .in("durum", ["aktif", "uyku_modu"])
          .order("id", { ascending: false })
          .limit(1);

        if (oturumHata) console.error("Supabase Hatası:", oturumHata);

        const aktifOturum =
          aktifOturumlar && aktifOturumlar.length > 0
            ? aktifOturumlar[0]
            : null;

        if (aktifOturum) {
          setOturumId(aktifOturum.id);
          setOturumDurumu(aktifOturum.durum);
          setKod(aktifOturum.katilim_kodu);
          setDersAdi(aktifOturum.ders_adi);
          setSecilenSinif(aktifOturum.room_id.toString());
          setSecilenDers(aktifOturum.course_id.toString());
          setAnlamayanSayisi(aktifOturum.anlamadim_sayaci || 0);

          const baslangic = localStorage.getItem("dersBaslangicZamani");
          if (baslangic) {
            const gecenSaniye = Math.floor(
              (Date.now() - parseInt(baslangic)) / 1000,
            );
            const kalanSaniye = 60 - gecenSaniye;
            setSayac(kalanSaniye > 0 ? kalanSaniye : 0);
          } else {
            setSayac(0);
          }
        }
      } catch (error) {
        console.error("Genel Hata:", error);
      } finally {
        setSayfaHazir(true);
      }
    };
    verileriGetir();
  }, [router]);

  useEffect(() => {
    let zamanlayici;
    if (kod && sayac > 0 && oturumDurumu === "aktif") {
      zamanlayici = setInterval(() => setSayac((onceki) => onceki - 1), 1000);
    }
    return () => clearInterval(zamanlayici);
  }, [kod, sayac, oturumDurumu]);

  useEffect(() => {
    if (!oturumId) return;

    // 1. İlk açılışta sayıyı getir
    const baslangicSayisiniGetir = async () => {
      const { count } = await supabase
        .from("attendance")
        .select("*", { count: "exact", head: true })
        .eq("oturum_id", oturumId);
      if (count !== null) setKatilimciSayisi(count);
    };
    baslangicSayisiniGetir();

    // 2. Anlık dinleyici (Biri girince 1 artırır)
    const radar = supabase
      .channel(`hoca-dinleyici-${oturumId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `id=eq.${oturumId}`,
        },
        (payload) => setAnlamayanSayisi(payload.new.anlamadim_sayaci),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "attendance",
          filter: `oturum_id=eq.${oturumId}`,
        },
        () => setKatilimciSayisi((o) => o + 1),
      )
      .subscribe();

    // 3. VİZYON: Yük Testi Koruması (Her 10 saniyede bir veritabanıyla kesin sayıyı senkronize et)
    const senkronizasyon = setInterval(async () => {
      const { count } = await supabase
        .from("attendance")
        .select("*", { count: "exact", head: true })
        .eq("oturum_id", oturumId);
      if (count !== null) setKatilimciSayisi(count);
    }, 10000);

    return () => {
      supabase.removeChannel(radar);
      clearInterval(senkronizasyon); // Çıkarken temizle
    };
  }, [oturumId]);

  // ==========================================
  // 3. FONKSİYONLAR (İŞ MANTIĞI)
  // ==========================================

  const oturumBaslat = async () => {
    if (!secilenSinif || !secilenDers)
      return alert("Lütfen sınıf ve ders seçimi yapınız.");
    setYukleniyor(true);
    setAnlamayanSayisi(0);

    // VİZYON: Yeni ders başlatmadan önce hocanın açık kalmış tüm eski derslerini "bitti" yap (Temizlik)
    await supabase
      .from("sessions")
      .update({ durum: "bitti" })
      .eq("hoca_id", hoca.id)
      .in("durum", ["aktif", "uyku_modu"]);

    const rastgeleKod = Math.floor(1000 + Math.random() * 9000).toString();
    const aktifDers = dersler.find((d) => d.id === parseInt(secilenDers));

    try {
      const { data, error } = await supabase
        .from("sessions")
        .insert([
          {
            hoca_id: hoca.id,
            room_id: parseInt(secilenSinif),
            course_id: parseInt(secilenDers),
            ders_adi: aktifDers.ders_adi,
            katilim_kodu: rastgeleKod,
            durum: "aktif",
          },
        ])
        .select()
        .single();

      if (error) throw error;

      setDersAdi(aktifDers.ders_adi);
      setKod(rastgeleKod);
      setOturumId(data.id);
      setOturumDurumu("aktif");
      setSayac(60);

      localStorage.setItem("dersBaslangicZamani", Date.now().toString());
    } catch (error) {
      alert("Oturum başlatılamadı: " + error.message);
    } finally {
      setYukleniyor(false);
    }
  };

  const molaVer = async () => {
    try {
      await supabase
        .from("sessions")
        .update({ durum: "uyku_modu", mola_modu: true })
        .eq("id", oturumId);
      setOturumDurumu("uyku_modu");
    } catch (error) {
      console.error("Duraklatma hatası:", error);
    }
  };

  const moladanDon = async () => {
    try {
      await supabase
        .from("sessions")
        .update({ durum: "aktif", mola_modu: false })
        .eq("id", oturumId);
      setOturumDurumu("aktif");
    } catch (error) {
      console.error("Sürdürme hatası:", error);
    }
  };

  const dersiBitir = async () => {
    if (confirm("Oturumu sonlandırmak istediğinize emin misiniz?")) {
      try {
        await supabase
          .from("sessions")
          .update({ durum: "bitti" })
          .eq("id", oturumId);

        setOturumId(null);
        setOturumDurumu(null);
        setKod(null);
        localStorage.removeItem("dersBaslangicZamani");
        alert("Oturum başarıyla sonlandırıldı.");
      } catch (error) {
        alert("Hata: " + error.message);
      }
    }
  };

  const disiplinNotuKaydet = async () => {
    if (!secilenOgrenciId || !disiplinNotu)
      return alert("Öğrenci ve uyarı içeriği zorunludur.");
    try {
      const { error } = await supabase.from("discipline_records").insert([
        {
          ogrenci_id: parseInt(secilenOgrenciId),
          hoca_id: hoca.id,
          oturum_id: oturumId,
          not_icerigi: disiplinNotu,
        },
      ]);

      if (error) throw error;
      alert("Kayıt başarıyla sisteme işlendi.");
      setSecilenOgrenciId("");
      setDisiplinNotu("");
    } catch (error) {
      alert("İşlem başarısız: " + error.message);
    }
  };

  // ==========================================
  // 4. ARAYÜZ (JSX)
  // ==========================================

  if (!hoca || !sayfaHazir) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-xl font-bold text-[#2d368f] animate-pulse">
          Sistem Bağlantısı Kuruluyor...
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

      <main className="max-w-4xl mx-auto">
        {!oturumId ? (
          // DERS BAŞLATMA EKRANI
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
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                ></path>
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">
              Akademik Oturum Başlatma
            </h2>
            <p className="text-gray-500 mb-6 text-sm">
              Lütfen bulunduğunuz dersliği ve yürüteceğiniz dersi seçin.
            </p>

            <div className="space-y-4 mb-6 text-left">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Derslik / Amfi
                </label>
                <select
                  value={secilenSinif}
                  onChange={(e) => setSecilenSinif(e.target.value)}
                  className="w-full px-4 py-3 rounded border border-gray-300 focus:ring-2 focus:ring-[#2A81EA] outline-none bg-gray-50"
                >
                  <option value="">-- Derslik Seçiniz --</option>
                  {siniflar.map((sinif) => (
                    <option key={sinif.id} value={sinif.id}>
                      {sinif.oda_adi}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Ders Kodu ve Adı
                </label>
                <select
                  value={secilenDers}
                  onChange={(e) => setSecilenDers(e.target.value)}
                  className="w-full px-4 py-3 rounded border border-gray-300 focus:ring-2 focus:ring-[#2A81EA] outline-none bg-gray-50"
                >
                  <option value="">-- Ders Seçiniz --</option>
                  {dersler.map((ders) => (
                    <option key={ders.id} value={ders.id}>
                      {ders.ders_kodu} - {ders.ders_adi}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={oturumBaslat}
              disabled={yukleniyor || !secilenSinif || !secilenDers}
              className="w-full bg-[#2A81EA] hover:bg-[#1e6bcc] text-white font-bold py-3.5 rounded shadow transition-all disabled:bg-gray-400"
            >
              {yukleniyor
                ? "Sistem Hazırlanıyor..."
                : "Oturumu Başlat ve Kod Üret"}
            </button>
          </div>
        ) : (
          // AKTİF DERS YÖNETİM EKRANI
          <div className="space-y-6">
            {/* Üst Bilgi Paneli */}
            <div className="bg-[#2d368f] text-white p-5 rounded shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 border-l-4 border-[#2A81EA]">
              <div>
                <h2 className="text-xl font-bold">{dersAdi}</h2>
                <p className="text-blue-200 text-sm mt-1">
                  Durum:{" "}
                  {oturumDurumu === "aktif"
                    ? "Oturum Aktif"
                    : "Oturum Duraklatıldı (Mola)"}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {oturumDurumu === "aktif" ? (
                  <button
                    onClick={molaVer}
                    className="bg-yellow-500 hover:bg-yellow-600 text-white px-5 py-2.5 rounded font-bold shadow-sm transition-colors text-sm"
                  >
                    Oturumu Duraklat
                  </button>
                ) : (
                  <button
                    onClick={moladanDon}
                    className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded font-bold shadow-sm transition-colors text-sm"
                  >
                    Oturumu Sürdür
                  </button>
                )}
                <button
                  onClick={dersiBitir}
                  className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded font-bold shadow-sm transition-colors text-sm"
                >
                  Oturumu Sonlandır
                </button>
              </div>
            </div>

            {/* Yoklama Sayacı ve Kod Panosu */}
            {kod && (
              <div className="bg-white p-8 rounded shadow-sm text-center relative overflow-hidden border border-gray-200">
                {sayac > 0 && oturumDurumu === "aktif" && (
                  <div className="absolute top-0 left-0 w-full h-1.5 bg-gray-100">
                    <div
                      className={`h-full transition-all duration-1000 ${sayac > 15 ? "bg-[#2A81EA]" : "bg-red-500"}`}
                      style={{ width: `${(sayac / 60) * 100}%` }}
                    ></div>
                  </div>
                )}

                <p className="text-sm font-semibold mb-4 uppercase tracking-wider text-gray-500">
                  {oturumDurumu === "uyku_modu"
                    ? "Oturum Duraklatıldı"
                    : sayac > 0
                      ? "Öğrencilerin Katılımı İçin Kodu Yansıtın"
                      : "Derse Katılım Kodu (Aktif)"}
                </p>

                <div
                  className={`text-[5rem] md:text-[6rem] leading-none font-black tracking-[0.2em] mb-4 ${oturumDurumu === "uyku_modu" ? "text-yellow-600" : "text-[#2d368f]"}`}
                >
                  {kod}
                </div>
                {/* CANLI VE LOGOLU ÖZEL QR KOD (Sadece süre varken görünür) */}
                {sayac > 0 && oturumDurumu === "aktif" && (
                  <div className="mt-4 flex flex-col items-center justify-center animate-fade-in border-t border-gray-100 pt-6">
                    <p className="text-xs font-bold text-[#2A81EA] uppercase tracking-widest mb-3">
                      İzleyiciler İçin Hızlı Katılım QR Kodu
                    </p>

                    {/* QR Kod Çerçevesi */}
                    <div className="relative p-3 bg-white border-2 border-dashed border-[#2A81EA] rounded-xl shadow-sm inline-block">
                      {/* KSÜ Mavisi (#2A81EA) Renginde Üretilen QR Kod */}
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&color=2A81EA&data=${typeof window !== "undefined" ? window.location.origin : ""}/misafir`}
                        alt="QR Kod"
                        className="w-40 h-40 md:w-48 md:h-48"
                      />

                      {/* QR Kodun Tam Ortasına Oturan KSÜ Logosu */}
                      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white p-1.5 rounded-xl shadow-lg border border-gray-100">
                        <img
                          src="/logo.png"
                          alt="Merkez Logo"
                          className="w-8 h-8 md:w-10 md:h-10 object-contain"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {oturumDurumu === "uyku_modu" ? (
                  <span className="text-lg font-bold text-yellow-600">
                    Duraklatma Devam Ediyor
                  </span>
                ) : sayac > 0 ? (
                  <span
                    className={`text-xl font-bold ${sayac > 15 ? "text-gray-700" : "text-red-500"}`}
                  >
                    {sayac} Saniye Kaldı
                  </span>
                ) : (
                  <span className="text-lg font-bold text-[#2A81EA]">
                    Katılım Süresi Doldu (Kod Halen Geçerli)
                  </span>
                )}
              </div>
            )}

            {/* Gerçek Zamanlı Paneller (Katılımcı ve Radar Yan Yana) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Canlı Katılımcı Sayacı */}
              <div className="bg-white p-5 rounded shadow-sm border border-gray-200 flex items-center justify-between transition-all duration-300">
                <div>
                  <h3 className="text-md font-bold text-[#2d368f]">
                    Anlık Katılım
                  </h3>
                  <p className="text-xs text-gray-500">
                    Sisteme kayıtlı öğrenci sayısı
                  </p>
                </div>
                <div className="px-4 py-3 rounded font-bold text-xl flex items-center space-x-2 bg-[#f0f6ff] text-[#2A81EA] border border-[#e0edff]">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    ></path>
                  </svg>
                  <span>{katilimciSayisi} Kişi</span>
                </div>
              </div>

              {/* Gerçek Zamanlı Anlamadım Radarı */}
              <div
                className={`p-5 rounded shadow-sm transition-all duration-500 flex items-center justify-between border ${anlamayanSayisi > 0 ? "bg-[#fff5f5] border-red-200" : "bg-white border-gray-200"}`}
              >
                <div>
                  <h3 className="text-md font-bold text-gray-800">
                    Öğrenci Geri Bildirimi
                  </h3>
                  <p className="text-xs text-gray-500">
                    Konu tekrarı talep edenler
                  </p>
                </div>
                <div
                  className={`px-4 py-3 rounded font-bold text-xl flex items-center space-x-2 ${anlamayanSayisi > 0 ? "bg-red-500 text-white animate-pulse" : "bg-gray-50 text-gray-400 border border-gray-100"}`}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    ></path>
                  </svg>
                  <span>{anlamayanSayisi} Bildirim</span>
                </div>
              </div>
            </div>

            {/* Disiplin ve Uyarı Kaydı Paneli */}
            <div className="bg-white p-6 rounded shadow-sm border border-gray-200">
              <h3 className="text-md font-bold text-[#2d368f] mb-4 border-b border-gray-100 pb-2 flex items-center">
                <svg
                  className="w-5 h-5 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  ></path>
                </svg>
                Disiplin İşlemi İşlemleri
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">
                    Öğrenci Seçimi
                  </label>
                  <select
                    value={secilenOgrenciId}
                    onChange={(e) => setSecilenOgrenciId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded border border-gray-300 focus:ring-1 focus:ring-[#2A81EA] outline-none text-sm bg-gray-50"
                  >
                    <option value="">-- Listeden Seçin --</option>
                    {ogrenciListesi.map((ogr) => (
                      <option key={ogr.id} value={ogr.id}>
                        {ogr.kullanici_no} - {ogr.ad_soyad}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">
                    Açıklama / Tutanak
                  </label>
                  <input
                    type="text"
                    placeholder="Örn: Oturum kurallarını ihlal."
                    value={disiplinNotu}
                    onChange={(e) => setDisiplinNotu(e.target.value)}
                    className="w-full px-3 py-2.5 rounded border border-gray-300 focus:ring-1 focus:ring-[#2A81EA] outline-none text-sm bg-gray-50"
                  />
                </div>
              </div>
              <button
                onClick={disiplinNotuKaydet}
                className="mt-4 w-full bg-gray-800 hover:bg-gray-900 text-white font-bold py-2.5 rounded transition-colors text-sm shadow-sm"
              >
                Kayıtlara İşle
              </button>
            </div>

            {/* Otomatik Denetim ve Uyarı Sistemi */}
            <div className="bg-white p-6 rounded shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-2">
                <h3 className="text-md font-bold text-[#2d368f] flex items-center">
                  <svg
                    className="w-5 h-5 mr-2 text-[#2A81EA]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                    ></path>
                  </svg>
                  Sistematik Devamsızlık Takibi
                </h3>
                <span className="text-xs font-bold text-[#2A81EA] bg-[#e0edff] px-2 py-1 rounded">
                  AKTİF
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex items-center p-3 bg-[#fff5f5] rounded border border-red-100">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-ping mr-3"></div>
                  <p className="text-sm text-red-800">
                    <span className="font-bold">220011</span> numaralı
                    öğrencinin devam/devamsızlık limiti kritik seviyededir.
                    İlgili durum raporu bölüm sekreterliğine iletilmiştir.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
