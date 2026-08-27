package com.tapapplink.reactnative;

import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.NonNull;

import com.android.installreferrer.api.InstallReferrerClient;
import com.android.installreferrer.api.InstallReferrerStateListener;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

public class TapAppLinkModule extends ReactContextBaseJavaModule {
  private final ReactApplicationContext reactContext;

  TapAppLinkModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.reactContext = reactContext;
  }

  @NonNull
  @Override
  public String getName() {
    return "TapAppLink";
  }

  @ReactMethod
  public void getInstallSignals(Promise promise) {
    WritableMap signals = Arguments.createMap();
    signals.putString(
        "deviceFamily",
        Build.MODEL.toLowerCase(Locale.US).contains("tablet") ? "Android Tablet" : "Android");
    signals.putString("locale", Locale.getDefault().toLanguageTag());
    String country = Locale.getDefault().getCountry();
    signals.putString("networkContext", country == null || country.isEmpty() ? "unknown" : country);

    AtomicBoolean settled = new AtomicBoolean(false);
    Runnable finish = () -> {
      if (settled.compareAndSet(false, true)) {
        promise.resolve(signals);
      }
    };

    new Handler(Looper.getMainLooper()).postDelayed(finish, 3000);

    try {
      InstallReferrerClient client = InstallReferrerClient.newBuilder(reactContext).build();
      client.startConnection(
          new InstallReferrerStateListener() {
            @Override
            public void onInstallReferrerSetupFinished(int responseCode) {
              try {
                if (responseCode == InstallReferrerClient.InstallReferrerResponse.OK) {
                  String referrer = client.getInstallReferrer().getInstallReferrer();
                  if (referrer != null && !referrer.isEmpty()) {
                    signals.putString("installReferrer", referrer);
                  }
                }
              } catch (Exception ignored) {
              } finally {
                try {
                  client.endConnection();
                } catch (Exception ignored) {
                }
                finish.run();
              }
            }

            @Override
            public void onInstallReferrerServiceDisconnected() {
              finish.run();
            }
          });
    } catch (Exception ignored) {
      finish.run();
    }
  }
}
