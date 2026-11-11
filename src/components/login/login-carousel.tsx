"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";

const SLIDES = [
  {
    name: "Portfólio",
    image: "/images/login-architecture.jpg",
    title: "Seu portfólio de imóveis,",
    highlight: "organizado de verdade.",
    description: "Cadastros, valores e disponibilidade sempre à mão.",
    position: "60% center",
  },
  {
    name: "Busca inteligente",
    image: "/images/login-interior.jpg",
    title: "Encontre o imóvel",
    highlight: "certo para cada cliente.",
    description: "Descreva o que procura e veja as opções mais compatíveis.",
    position: "center",
  },
  {
    name: "Vitrine",
    image: "/images/login-portfolio.jpg",
    title: "Uma vitrine com a",
    highlight: "identidade da sua imobiliária.",
    description: "Apresente seu portfólio e receba novos contatos.",
    position: "center",
  },
];

export function LoginCarousel() {
  const [active, setActive] = useState(0);
  const [desktop, setDesktop] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const screen = window.matchMedia("(min-width: 901px)");
    const updateScreen = () => setDesktop(screen.matches);
    const updateVisibility = () =>
      setVisible(document.visibilityState === "visible");
    updateScreen();
    updateVisibility();
    screen.addEventListener("change", updateScreen);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      screen.removeEventListener("change", updateScreen);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  useEffect(() => {
    if (!desktop || !visible) return;
    const timer = window.setTimeout(
      () => setActive((current) => (current + 1) % SLIDES.length),
      6500,
    );
    return () => window.clearTimeout(timer);
  }, [active, desktop, visible]);

  return (
    <section
      className="login-visual"
      role="region"
      aria-roledescription="carrossel"
      aria-label="Recursos do Imovelink"
    >
      <div className="login-carousel-stage" aria-live="off" aria-atomic="true">
        {SLIDES.map((slide, index) => (
          <div
            key={slide.name}
            className={`login-slide${active === index ? " is-active" : ""}`}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} de ${SLIDES.length}`}
            aria-hidden={active !== index}
          >
            <div className="login-slide-photo">
              <Image
                src={slide.image}
                alt=""
                fill
                priority={index === 0}
                sizes="(max-width: 900px) 1px, 56vw"
                quality={85}
                className="login-photo"
                style={{ objectPosition: slide.position }}
              />
            </div>
            <div className="login-slide-copy">
              <h2>
                {slide.title} <span>{slide.highlight}</span>
              </h2>
              <p>{slide.description}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="login-carousel-controls">
        <div
          className="login-carousel-dots"
          role="group"
          aria-label="Escolher slide"
        >
          {SLIDES.map((slide, index) => (
            <button
              key={slide.name}
              type="button"
              className={`login-carousel-dot${active === index ? " is-active" : ""}`}
              aria-label={`Exibir slide ${index + 1}: ${slide.name}`}
              aria-pressed={active === index}
              onClick={() => setActive(index)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
