let srvurl = "https://ploggm-webrtc.ngrok.io";
let pc = null;
let videoElement = document.getElementById("video");

let mediaConstraints = {
  offerToReceiveAudio: true,
  offerToReceiveVideo: true,
};

let iceServers = [
  { urls: ["stun:stun.bitam.com:3478"] },
  {
    credential: "b1t4mb1t4m",
    urls: ["turn:turn.bitam.com"],
    username: "ploggm",
  },
];

let pcConfig = {
  iceServers: [
    { urls: ["stun:stun.bitam.com:3478"] },
    {
      credential: "b1t4mb1t4m",
      urls: ["turn:turn.bitam.com"],
      username: "ploggm",
    },
  ],
};
let earlyCandidates = [];

function handleHttpErrors(response) {
  if (!response.ok) {
    throw Error(response.statusText);
  }
  return response;
}

function disconnect() {
  if (videoElement) {
    videoElement.src = "";
  }
  if (pc) {
    fetch(srvurl + "/api/hangup?peerid=" + pc.peerid)
      .then(handleHttpErrors)
      .catch((error) => this.onError("hangup " + error));

    try {
      pc.close();
    } catch (e) {
      console.log("Failure close peer connection:" + e);
    }
    pc = null;
  }
}

function onIceCandidate(event) {
  if (event.candidate) {
    if (pc.currentRemoteDescription) {
      addIceCandidate(pc.peerid, event.candidate);
    } else {
      earlyCandidates.push(event.candidate);
    }
  } else {
    console.log("End of candidates.");
  }
}

function createPeerConnection() {
  console.log("createPeerConnection  config: " + JSON.stringify(pcConfig));
  pc = new RTCPeerConnection(pcConfig);
  pc.peerid = Math.random();

  pc.onicecandidate = function (evt) {
    onIceCandidate(evt);
  };
  pc.onaddstream = function (evt) {
    onAddStream(evt);
  };
  pc.oniceconnectionstatechange = function (evt) {
    console.log("oniceconnectionstatechange  state: " + pc.iceConnectionState);
    if (videoElement) {
      if (pc.iceConnectionState === "connected") {
        videoElement.style.opacity = "1.0";
      } else if (pc.iceConnectionState === "disconnected") {
        videoElement.style.opacity = "0.25";
      } else if (
        pc.iceConnectionState === "failed" ||
        pc.iceConnectionState === "closed"
      ) {
        videoElement.style.opacity = "0.5";
      } else if (pc.iceConnectionState === "new") {
        getIceCandidate();
      }
    }
  };
  pc.ondatachannel = function (evt) {
    console.log("remote datachannel created:" + JSON.stringify(evt));

    evt.channel.onopen = function () {
      console.log("remote datachannel open");
    };
    evt.channel.onmessage = function (event) {
      console.log("remote datachannel recv:" + JSON.stringify(event.data));
    };
  };
  pc.onicegatheringstatechange = function () {
    if (pc.iceGatheringState === "complete") {
      const recvs = pc.getReceivers();

      recvs.forEach((recv) => {
        if (recv.track && recv.track.kind === "video") {
          console.log("codecs:" + JSON.stringify(recv.getParameters().codecs));
        }
      });
    }
  };

  try {
    var dataChannel = pc.createDataChannel("ClientDataChannel");
    dataChannel.onopen = function () {
      console.log("local datachannel open");
    };
    dataChannel.onmessage = function (evt) {
      console.log("local datachannel recv:" + JSON.stringify(evt.data));
    };
  } catch (e) {
    console.log("Cannor create datachannel error: " + e);
  }

  console.log(
    "Created RTCPeerConnnection with config: " + JSON.stringify(pcConfig)
  );
  return pc;
}

function addIceCandidate(peerid, candidate) {
  fetch(srvurl + "/api/addIceCandidate?peerid=" + peerid, {
    method: "POST",
    body: JSON.stringify(candidate),
  })
    .then(handleHttpErrors)
    .then((response) => response.json())
    .then((response) => {
      console.log("addIceCandidate ok:" + response);
    })
    .catch((error) => onError("addIceCandidate " + error));
}

function onAddStream(event) {
  console.log("Remote track added:" + JSON.stringify(event));

  videoElement.srcObject = event.stream;
  var promise = videoElement.play();
  console.log("event", event);
  if (promise !== undefined) {
    promise.catch(function (error) {
      console.warn("error:" + error);
      videoElement.setAttribute("controls", true);
    });
  }
}

function onReceiveCall(dataJson) {
  console.log("offer: " + JSON.stringify(dataJson));
  var descr = new RTCSessionDescription(dataJson);
  pc.setRemoteDescription(
    descr,
    function () {
      console.log("setRemoteDescription ok");
      while (earlyCandidates.length) {
        var candidate = earlyCandidates.shift();
        addIceCandidate(pc.peerid, candidate);
      }

      getIceCandidate();
    },
    function (error) {
      console.log("setRemoteDescription error:" + JSON.stringify(error));
    }
  );
}

function onReceiveCandidate(dataJson) {
  console.log("candidate: " + JSON.stringify(dataJson));
  if (dataJson) {
    for (var i = 0; i < dataJson.length; i++) {
      var candidate = new RTCIceCandidate(dataJson[i]);

      console.log("Adding ICE candidate :" + JSON.stringify(candidate));
      pc.addIceCandidate(
        candidate,
        function () {
          console.log("addIceCandidate OK");
        },
        function (error) {
          console.log("addIceCandidate error:" + JSON.stringify(error));
        }
      );
    }
    pc.addIceCandidate();
  }
}

function onError(status) {
  console.log("onError:" + status);
}

function onReceiveGetIceServers(
  iceServers,
  videourl,
  audiourl,
  options,
  stream
) {
  iceServers = iceServers;
  pcConfig = iceServers || { iceServers: [] };
  try {
    createPeerConnection();

    var callurl =
      srvurl +
      "/api/call?peerid=" +
      pc.peerid +
      "&url=" +
      encodeURIComponent(videourl);
    if (audiourl) {
      callurl += "&audiourl=" + encodeURIComponent(audiourl);
    }
    if (options) {
      callurl += "&options=" + encodeURIComponent(options);
    }

    if (stream) {
      pc.addStream(stream);
    }

    // clear early candidates
    earlyCandidates.length = 0;

    // create Offer
    pc.createOffer(mediaConstraints).then(
      function (sessionDescription) {
        console.log("Create offer:" + JSON.stringify(sessionDescription));

        pc.setLocalDescription(
          sessionDescription,
          function () {
            fetch(callurl, {
              method: "POST",
              body: JSON.stringify(sessionDescription),
            })
              .then(handleHttpErrors)
              .then((response) => response.json())
              .catch((error) => onError("call " + error))
              .then((response) => onReceiveCall(response))
              .catch((error) => onError("call " + error));
          },
          function (error) {
            console.log("setLocalDescription error:" + JSON.stringify(error));
          }
        );
      },
      function (error) {
        alert("Create offer error:" + JSON.stringify(error));
      }
    );
  } catch (e) {
    disconnect();
    alert("connect error: " + e);
  }
}

function getIceCandidate() {
  fetch(srvurl + "/api/getIceCandidate?peerid=" + pc.peerid)
    .then(handleHttpErrors)
    .then((response) => response.json())
    .then((response) => onReceiveCandidate(response))
    .catch((error) => onError("getIceCandidate " + error));
}

function connect(videourl, audiourl, options, localstream) {
  disconnect();
  // getIceServers is not already received
  if (!iceServers) {
    console.log("Get IceServers");

    fetch(srvurl + "/api/getIceServers")
      .then(handleHttpErrors)
      .then((response) => response.json())
      .then((response) =>
        onReceiveGetIceServers(
          response,
          videourl,
          audiourl,
          options,
          localstream
        )
      )
      .catch((error) => onError("getIceServers " + error));
  } else {
    onReceiveGetIceServers(
      iceServers,
      videourl,
      audiourl,
      options,
      localstream
    );
  }
}

// get DOM elements
var dataChannelLog = document.getElementById("data-channel"),
  iceConnectionLog = document.getElementById("ice-connection-state"),
  iceGatheringLog = document.getElementById("ice-gathering-state"),
  signalingLog = document.getElementById("signaling-state");

// data channel
var dc = null,
  dcInterval = null;

function start() {
  document.getElementById("start").style.display = "none";

  connect(
    "Pollo Loco Gomez Morin 18",
    undefined,
    "rtptransport=tcp&timeout=60"
  );

  document.getElementById("stop").style.display = "inline-block";
}

function stop() {
  document.getElementById("stop").style.display = "none";

  // close data channel
  if (dc) {
    dc.close();
  }

  // close transceivers
  if (pc.getTransceivers) {
    pc.getTransceivers().forEach(function (transceiver) {
      if (transceiver.stop) {
        transceiver.stop();
      }
    });
  }

  // close local audio / video
  pc.getSenders().forEach(function (sender) {
    sender.track.stop();
  });

  // close peer connection
  setTimeout(function () {
    pc.close();
  }, 500);
}

function sdpFilterCodec(kind, codec, realSdp) {
  var allowed = [];
  var rtxRegex = new RegExp("a=fmtp:(\\d+) apt=(\\d+)\r$");
  var codecRegex = new RegExp("a=rtpmap:([0-9]+) " + escapeRegExp(codec));
  var videoRegex = new RegExp("(m=" + kind + " .*?)( ([0-9]+))*\\s*$");

  var lines = realSdp.split("\n");

  var isKind = false;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("m=" + kind + " ")) {
      isKind = true;
    } else if (lines[i].startsWith("m=")) {
      isKind = false;
    }

    if (isKind) {
      var match = lines[i].match(codecRegex);
      if (match) {
        allowed.push(parseInt(match[1]));
      }

      match = lines[i].match(rtxRegex);
      if (match && allowed.includes(parseInt(match[2]))) {
        allowed.push(parseInt(match[1]));
      }
    }
  }

  var skipRegex = "a=(fmtp|rtcp-fb|rtpmap):([0-9]+)";
  var sdp = "";

  isKind = false;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("m=" + kind + " ")) {
      isKind = true;
    } else if (lines[i].startsWith("m=")) {
      isKind = false;
    }

    if (isKind) {
      var skipMatch = lines[i].match(skipRegex);
      if (skipMatch && !allowed.includes(parseInt(skipMatch[2]))) {
        continue;
      } else if (lines[i].match(videoRegex)) {
        sdp += lines[i].replace(videoRegex, "$1 " + allowed.join(" ")) + "\n";
      } else {
        sdp += lines[i] + "\n";
      }
    } else {
      sdp += lines[i] + "\n";
    }
  }

  return sdp;
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}
