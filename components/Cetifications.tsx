'use client'
import React from "react";
import { useTranslations } from "next-intl";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay } from "swiper/modules";   // ✅ register module

// Swiper styles
import "swiper/css";

const certifications = [
  { id: 1, name: "Certification 1", src: "/certifications/1.png" },
  { id: 2, name: "Certification 2", src: "/certifications/2.jpg" },
  { id: 3, name: "Certification 3", src: "/certifications/3.png" },
  { id: 4, name: "Certification 4", src: "/certifications/4.jpg" },
  { id: 5, name: "Certification 5", src: "/certifications/5.png" },
  { id: 6, name: "Certification 6", src: "/certifications/6.png" },
  { id: 7, name: "Certification 7", src: "/certifications/7.jpg" },
  { id: 8, name: "Certification 8", src: "/certifications/8.png" },
  { id: 9, name: "Certification 9", src: "/certifications/9.png" },
  { id: 10, name: "Certification 10", src: "/certifications/10.png" },
  { id: 11, name: "Certification 11", src: "/certifications/11.jpg" },
];

const CertificationSwiper: React.FC = () => {
  const t = useTranslations("home");
  return (
    <section className="certification-swiper" style={{ padding: "5px" }}>
      {/* Title */}
      <h2
        style={{
          fontSize: "1.8rem",
          fontWeight: 900,
          letterSpacing: ".01em",
          textAlign: "center",
          marginBottom: "12px",
        }}
      >
        {t("certificationsTitle")}
      </h2>

      <Swiper
        modules={[Autoplay]}                 // ✅ enable autoplay
        spaceBetween={5}
        loop={true}            // ✅ smoother looping at breakpoints
        speed={650}
        autoplay={{
          delay: 2500,
          disableOnInteraction: false,
          pauseOnMouseEnter: true,
        }}
        observer
        observeParents
        breakpoints={{
          0:    { slidesPerView: 2 },       // phones
          480:  { slidesPerView: 3 },
          768:  { slidesPerView: 4 },
          1024: { slidesPerView: 7 },       // desktop
        }}
        style={{ paddingTop: 6, paddingBottom: 6 }}
      >
        {certifications.map((cert) => (
          <SwiperSlide key={cert.id}>
            <div style={{ textAlign: "center" }}>
              <img
                src={cert.src}
                alt={cert.name}
                style={{
                  width: 88,
                  height: 88,
                  objectFit: "cover",
                  borderRadius: 8,
                  margin: "0 auto",
                  display: "block",
                }}
                loading="lazy"
                decoding="async"
              />
              {/* <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: "#6b7280",
                  lineHeight: 1.2,
                }}
              >
                {cert.name}
              </div> */}
            </div>
          </SwiperSlide>
        ))}
      </Swiper>
    </section>
  );
};

export default CertificationSwiper;
