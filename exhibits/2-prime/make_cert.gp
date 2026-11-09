\\ Proves prime.txt prime with PARI/GP (>= 2.11) and writes the ECPP certificate.
\\ Run from this folder: gp -q make_cert.gp      (check it: gp -q verify_cert.gp)
default(parisizemax, 4*10^9);
n = eval(concat(readstr("prime.txt")));
t = getwalltime(); gettime();
print("isprime(n) = ", isprime(n), "   (", gettime(), " ms CPU, ", getwalltime() - t, " ms wall)");
t = getwalltime(); gettime();
cert = primecert(n);
print("primecert(n): ", #cert, " ECPP steps   (", gettime(), " ms CPU, ", getwalltime() - t, " ms wall)");
f = fileopen("prime.cert.gp", "w"); filewrite(f, Str(cert)); fileclose(f);
print("primecertisvalid(cert) = ", primecertisvalid(cert));
quit;
