FROM postgres:16

# Install Python and the psycopg2 driver so we can parse proof_tree.bin and
# import it into Postgres at container initialization time.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-psycopg2 \
 && rm -rf /var/lib/apt/lists/*

COPY load_proof_tree.py /usr/local/bin/load_proof_tree.py
COPY init-proof-tree.sh /docker-entrypoint-initdb.d/init-proof-tree.sh
RUN chmod +x /docker-entrypoint-initdb.d/init-proof-tree.sh
