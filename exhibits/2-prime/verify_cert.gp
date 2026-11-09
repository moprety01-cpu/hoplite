\\ Re-checks the ECPP (Atkin-Morain) primality certificate with PARI/GP >= 2.11.
\\ Run from this folder: gp -q verify_cert.gp
n = eval(concat(readstr("prime.txt")));
cert = read("prime.cert.gp");
print("certificate is for prime.txt: ", cert[1][1] == n);
print("primecertisvalid: ", primecertisvalid(cert));
quit;
