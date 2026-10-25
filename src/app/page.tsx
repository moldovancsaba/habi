import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <header className={styles.header}>
          <p className="brand">Habi</p>
          <p className="eyebrow">Sportolói támogatás</p>
        </header>

        <section
          className={`workspace-section ${styles.panel}`}
          aria-labelledby="service-title"
        >
          <p className="eyebrow">Játékosok, családok és edzők közösen</p>
          <h1 id="service-title">Értsük meg együtt, mi segít a sportban.</h1>
          <p className={styles.intro}>
            A saját beszámolók, a család tapasztalatai és az edző megfigyelései
            együtt adnak kapaszkodót a következő lépéshez.
          </p>

          <div className={`sharing-note ${styles.accessNote}`}>
            A Habi a belépett személyhez tartozó szerep és jogosultság alapján
            jeleníti meg az adatokat. A belépési folyamat még nincs
            csatlakoztatva ehhez az új alkalmazáshoz.
          </div>

          <button className="primary" type="button" disabled>
            Biztonságos belépés
          </button>
          <p className={styles.status} role="status">
            A bejelentkezés előkészítés alatt áll. Személyes adat és mintaprofil
            nem jelenik meg ezen az oldalon.
          </p>
        </section>

        <footer className={styles.footer}>
          A Habi új alkalmazása jelenleg fejlesztés alatt áll.
        </footer>
      </div>
    </main>
  );
}
