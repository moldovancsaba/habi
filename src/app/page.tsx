import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main} aria-labelledby="service-title">
      <section className={styles.status} aria-labelledby="service-title">
        <h1 id="service-title">A Habi jelenleg nem érhető el</h1>
        <p>Kérjük, próbáld meg később.</p>
      </section>
    </main>
  );
}
