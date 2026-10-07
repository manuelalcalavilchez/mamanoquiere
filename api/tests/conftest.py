import os
import tempfile

tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{tmp}/test.db"
os.environ["MEDIA_DIR"] = f"{tmp}/media"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.seed import main as seed  # noqa: E402


@pytest.fixture(scope="session")
def client():
    seed("admin@test.com", "admin1234")
    return TestClient(app)


@pytest.fixture(scope="session")
def admin(client):
    r = client.post("/auth/login", data={"username": "admin@test.com", "password": "admin1234"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}
