# İmtahan nəticələri reyestri

PDF və ZIP fayllarındakı imtahan cədvəllərini oxuyan, tarix üzrə saxlayan və bütün istifadəçilərlə Firebase üzərindən paylaşan sadə reyestr tətbiqidir.

## Yeni funksiyalar

- PDF və ZIP əlavə etməzdən əvvəl məcburi tarix seçimi.
- Qeydlər tarix bölmələri altında açılıb-bağlanan (ox işarəli) ilə göstərilir.
- Fənn adları ayrıca başlıq kimi göstərilir və uyğun mənbə PDF-i yeni pəncərədə açılır.
- `Excelə yüklə` düyməsi Azərbaycan dilində bütün sahələri səliqəli Excel-uyğun `.xls` faylına çıxarır.
- Göy, Yaşıl, Sarı, Qırmızı, Dark, Ağ və Hacker temaları; hər temada mətn/fon kontrastı ayrıca tənzimlənib (Dark və Hacker temalarında yazılar oxunaqlıdır).
- Bütün işarələr özəl SVG ikonlardır (emoji və ya klaviatura simvolu istifadə olunmur).
- Silmə təsdiqi üçün brauzerin standart pəncərəsi əvəzinə özəl təsdiq pəncərəsi.
- Firebase Realtime Database ilə canlı ümumi məlumat axını.
- Firebase Storage-də saxlanan PDF mənbə linkləri.
- Gizli admin paneli: axtarış xanasına giriş kodunu yazdıqda avtomatik açılır. Seçilmiş yükləmə tarixindəki bütün qeydlər Firebase Database-dən, PDF-lər isə Storage-dən silinir. Kod interfeysdə göstərilmir və `js/app.js` daxilində yalnız hash şəklində saxlanılır.
- Fərdi qeyd silmə funksiyası qorunub; ümumi silmə düyməsi yoxdur.

## Firebase qeydləri

Firebase konfiqurasiyası `js/store.js` daxilində istifadə olunur. Bütün istifadəçilərin məlumatları görməsi və dəyişikliklərin canlı görünməsi üçün Firebase Console-da Realtime Database və Storage qaydaları açıq olmalıdır. Hazır nümunələr `firebase.database.rules.json` və `firebase.storage.rules` fayllarındadır.

Bu qaydalar ictimai yazma icazəsi verdiyi üçün real production mühitində anonim giriş və istifadəçi əsaslı qaydalar əlavə etmək daha təhlükəsizdir. Hazır layihə istifadəçi login-i tələb etmədən hamı üçün paylaşılmış iş axınına uyğun hazırlanıb.

## İşə salmaq

Node.js 18 və ya daha yeni versiya ilə:

    npm start

Sonra `http://127.0.0.1:8080` ünvanını açın. Başqa port üçün `PORT=3000 npm start` istifadə edin.

## Test

    npm test

Parser və ZIP/PDF testləri layihədə saxlanılıb.
