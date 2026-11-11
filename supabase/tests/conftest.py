"""Yerel PostgreSQL üzerinde sıfırdan test veritabanı kurar: Supabase taklidi + migration'lar.

Ortam değişkeni TEST_DATABASE_URL bir yönetici bağlantısıdır (varsayılan yerel postgres).
"""

import os
from contextlib import contextmanager
from pathlib import Path

import psycopg
import pytest
from psycopg import pq

ROOT = Path(__file__).parents[1]
ADMIN_URL = os.environ.get("TEST_DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres")
DB_NAME = "mentormap_test"


def _url(dbname):
    base, _ = ADMIN_URL.rsplit("/", 1)
    return f"{base}/{dbname}"


def kur_test_db() -> str:
    """Test veritabanını sıfırdan kurar ve bağlantı adresini döner."""
    with psycopg.connect(ADMIN_URL, autocommit=True) as c:
        c.execute(f"drop database if exists {DB_NAME} with (force)")
        c.execute(f"create database {DB_NAME}")
    url = _url(DB_NAME)
    with psycopg.connect(url, autocommit=True) as c:
        c.execute((ROOT / "tests" / "supabase_stub.sql").read_text())
        for f in sorted((ROOT / "migrations").glob("*.sql")):
            c.execute(f.read_text())
    return url


@pytest.fixture(scope="session")
def db_url():
    return kur_test_db()


@pytest.fixture
def db(db_url):
    """Her test kendi transaction'ında çalışır ve sonunda geri alınır."""
    with psycopg.connect(db_url) as c:
        yield c
        c.rollback()


@contextmanager
def as_user(conn, email):
    """İsteği Supabase'in 'authenticated' rolüyle ve verilen e-postanın JWT'siyle çalıştırır."""
    conn.execute("savepoint as_user")
    conn.execute("set local role authenticated")
    conn.execute("select set_config('request.jwt.claims', %s, true)", (f'{{"email": "{email}"}}',))
    try:
        yield conn
    finally:
        # Beklenen bir hata transaction'ı bozduysa savepoint'e dön (rol ayarı da geri alınır).
        if conn.info.transaction_status == pq.TransactionStatus.INERROR:
            conn.execute("rollback to savepoint as_user")
        conn.execute("reset role")
        conn.execute("select set_config('request.jwt.claims', '', true)")
