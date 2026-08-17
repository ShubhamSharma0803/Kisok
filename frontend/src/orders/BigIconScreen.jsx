import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Accessibility,
  Volume2,
  ShoppingCart,
} from 'lucide-react';

export default function BigIconScreen() {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-[#f7f1e8] text-[#211b17]">

      {/* ================= HEADER ================= */}
      <header className="border-b-2 border-[#dfd1c1] bg-[#fffaf3] px-6 py-5">

        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">

          {/* BACK BUTTON */}
          <button
            type="button"
            onClick={() => navigate('/')}
            className="
              flex
              h-16
              w-16
              shrink-0
              items-center
              justify-center
              rounded-2xl
              border-2
              border-[#d7c7b4]
              bg-white
              text-[#211b17]
              shadow-sm
              transition
              hover:bg-[#f3eadf]
              active:scale-95
            "
            aria-label="Go back to mode selection"
          >
            <ArrowLeft className="h-9 w-9" />
          </button>


          {/* TITLE */}
          <div className="text-center">

            <div className="flex items-center justify-center gap-2">

              <Accessibility className="h-7 w-7 text-[#8b5e34]" />

              <p className="
                text-sm
                font-bold
                uppercase
                tracking-[0.2em]
                text-[#8b5e34]
              ">
                Big Icon Mode
              </p>

            </div>

            <h1 className="
              mt-1
              font-display
              text-4xl
              font-bold
              md:text-5xl
            ">
              Easy to Order
            </h1>

          </div>


          {/* NORMAL MODE */}
          <button
            type="button"
            onClick={() => navigate('/order')}
            className="
              flex
              h-16
              items-center
              gap-3
              rounded-2xl
              bg-[#1f352d]
              px-5
              font-bold
              text-white
              shadow-lg
              transition
              hover:bg-[#29483d]
              active:scale-95
            "
          >
            <Volume2 className="h-7 w-7 text-[#e9bd67]" />

            <span className="hidden md:block">
              Normal Mode
            </span>
          </button>

        </div>

      </header>


      {/* ================= MAIN ================= */}
      <section className="
        mx-auto
        max-w-[1500px]
        px-6
        py-8
      ">

        {/* WELCOME MESSAGE */}
        <div className="
          rounded-[2rem]
          bg-[#1f352d]
          px-6
          py-10
          text-center
          shadow-[0_18px_40px_rgba(31,53,45,.18)]
          md:px-10
        ">

          <h2 className="
            font-display
            text-4xl
            font-bold
            leading-tight
            text-white
            md:text-6xl
          ">
            What would you like today?
          </h2>

          <p className="
            mt-4
            text-xl
            font-semibold
            text-[#e8ddd0]
            md:text-2xl
          ">
            Choose a dish below
          </p>

        </div>


        {/* ================= DEMO FOOD CARDS ================= */}
        <div className="
          mt-8
          grid
          grid-cols-1
          gap-7
          md:grid-cols-2
          xl:grid-cols-3
        ">

          {/* FOOD CARD 1 */}
          <div className="
            overflow-hidden
            rounded-[2rem]
            border-2
            border-[#dfd1c1]
            bg-white
            shadow-[0_12px_35px_rgba(76,49,28,.10)]
          ">

            <div className="
              flex
              h-64
              items-center
              justify-center
              bg-[#eee4d6]
              text-8xl
            ">
              🍔
            </div>

            <div className="p-7">

              <h3 className="
                font-display
                text-4xl
                font-bold
              ">
                Veg Burger
              </h3>

              <p className="
                mt-3
                text-xl
                font-semibold
                text-[#796a5d]
              ">
                Delicious vegetable burger
              </p>

              <div className="
                mt-6
                flex
                items-center
                justify-between
                gap-4
              ">

                <span className="
                  font-display
                  text-3xl
                  font-bold
                  text-[#8b4f2d]
                ">
                  ₹99
                </span>

                <button
                  type="button"
                  className="
                    flex
                    min-h-[68px]
                    min-w-[150px]
                    items-center
                    justify-center
                    gap-2
                    rounded-full
                    bg-[#1f352d]
                    px-7
                    text-xl
                    font-bold
                    text-white
                    shadow-lg
                    transition
                    hover:bg-[#29483d]
                    active:scale-95
                  "
                >
                  <span className="text-3xl">+</span>
                  ADD
                </button>

              </div>

            </div>

          </div>


          {/* FOOD CARD 2 */}
          <div className="
            overflow-hidden
            rounded-[2rem]
            border-2
            border-[#dfd1c1]
            bg-white
            shadow-[0_12px_35px_rgba(76,49,28,.10)]
          ">

            <div className="
              flex
              h-64
              items-center
              justify-center
              bg-[#eee4d6]
              text-8xl
            ">
              ☕
            </div>

            <div className="p-7">

              <h3 className="
                font-display
                text-4xl
                font-bold
              ">
                Cold Coffee
              </h3>

              <p className="
                mt-3
                text-xl
                font-semibold
                text-[#796a5d]
              ">
                Chilled creamy coffee
              </p>

              <div className="
                mt-6
                flex
                items-center
                justify-between
                gap-4
              ">

                <span className="
                  font-display
                  text-3xl
                  font-bold
                  text-[#8b4f2d]
                ">
                  ₹89
                </span>

                <button
                  type="button"
                  className="
                    flex
                    min-h-[68px]
                    min-w-[150px]
                    items-center
                    justify-center
                    gap-2
                    rounded-full
                    bg-[#1f352d]
                    px-7
                    text-xl
                    font-bold
                    text-white
                    shadow-lg
                    transition
                    hover:bg-[#29483d]
                    active:scale-95
                  "
                >
                  <span className="text-3xl">+</span>
                  ADD
                </button>

              </div>

            </div>

          </div>


          {/* FOOD CARD 3 */}
          <div className="
            overflow-hidden
            rounded-[2rem]
            border-2
            border-[#dfd1c1]
            bg-white
            shadow-[0_12px_35px_rgba(76,49,28,.10)]
          ">

            <div className="
              flex
              h-64
              items-center
              justify-center
              bg-[#eee4d6]
              text-8xl
            ">
              🥪
            </div>

            <div className="p-7">

              <h3 className="
                font-display
                text-4xl
                font-bold
              ">
                Veg Sandwich
              </h3>

              <p className="
                mt-3
                text-xl
                font-semibold
                text-[#796a5d]
              ">
                Fresh and crispy sandwich
              </p>

              <div className="
                mt-6
                flex
                items-center
                justify-between
                gap-4
              ">

                <span className="
                  font-display
                  text-3xl
                  font-bold
                  text-[#8b4f2d]
                ">
                  ₹79
                </span>

                <button
                  type="button"
                  className="
                    flex
                    min-h-[68px]
                    min-w-[150px]
                    items-center
                    justify-center
                    gap-2
                    rounded-full
                    bg-[#1f352d]
                    px-7
                    text-xl
                    font-bold
                    text-white
                    shadow-lg
                    transition
                    hover:bg-[#29483d]
                    active:scale-95
                  "
                >
                  <span className="text-3xl">+</span>
                  ADD
                </button>

              </div>

            </div>

          </div>

        </div>

      </section>


      {/* ================= CART ================= */}
      <div className="
        fixed
        bottom-5
        left-1/2
        z-50
        w-[94%]
        max-w-2xl
        -translate-x-1/2
      ">

        <button
          type="button"
          onClick={() => navigate('/order')}
          className="
            flex
            min-h-[82px]
            w-full
            items-center
            justify-center
            gap-4
            rounded-[1.75rem]
            bg-[#1f352d]
            px-8
            text-white
            shadow-[0_20px_50px_rgba(31,53,45,.35)]
            transition
            hover:bg-[#29483d]
            active:scale-[0.98]
          "
        >

          <ShoppingCart className="
            h-9
            w-9
            text-[#e9bd67]
          " />

          <span className="
            text-2xl
            font-bold
          ">
            View Your Order
          </span>

        </button>

      </div>

    </main>
  );
}