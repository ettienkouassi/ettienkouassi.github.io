#!/bin/bash
# Exécuté UNE fois à la création du volume PostgreSQL (docker-entrypoint-initdb.d).
# Crée : un rôle propriétaire (migrations) et un rôle applicatif sans privilège (soumis au RLS).
set -euo pipefail
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
  CREATE ROLE trainingos_owner LOGIN PASSWORD '${OWNER_PASSWORD}' CREATEDB;
  CREATE ROLE trainingos_app LOGIN PASSWORD '${APP_PASSWORD}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  CREATE DATABASE trainingos OWNER trainingos_owner;
  REVOKE ALL ON DATABASE trainingos FROM PUBLIC;
  GRANT CONNECT ON DATABASE trainingos TO trainingos_app;
SQL
